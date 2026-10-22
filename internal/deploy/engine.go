package deploy

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"shipyard/internal/model"
	"shipyard/internal/remote"
)

type Engine struct {
	Guard           func(context.Context) error
	Remote          remote.Executor
	Log             io.Writer
	Dial            func(context.Context, string, string) (net.Conn, error)
	PrepareNetworks func(context.Context, *model.Release, []model.NetworkContainer) error
	ValidateConfig  func(context.Context, model.Release, map[string]any) error
}

func Output(ctx context.Context, r remote.Executor, args ...string) (string, error) {
	output, err := remote.Output(ctx, r, args...)
	return strings.TrimSpace(output), err
}
func Write(ctx context.Context, r remote.Executor, path string, b []byte) error {
	return r.Run(ctx, "umask 077; cat > "+remote.Quote(path)+" && chmod 600 "+remote.Quote(path), bytes.NewReader(b), io.Discard)
}
func (e *Engine) cleanupTemporary(ctx context.Context, paths ...string) {
	cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	_ = e.Remote.Run(cleanup, remote.Command(append([]string{"rm", "-f"}, paths...)...), nil, io.Discard)
}
func (e *Engine) command(ctx context.Context, args ...string) error {
	if e.Guard != nil {
		if err := e.Guard(ctx); err != nil {
			return err
		}
	}
	output := e.Log
	if output == nil {
		output = io.Discard
	}
	for i := 0; i+1 < len(args); i++ {
		if args[i] == "docker" && args[i+1] == "compose" {
			return e.runComposeProgress(ctx, remote.Command(args...))
		}
	}
	return e.Remote.Run(ctx, remote.Command(args...), nil, output)
}
func (e *Engine) runComposeProgress(ctx context.Context, command string) error {
	if e.Guard != nil {
		if err := e.Guard(ctx); err != nil {
			return err
		}
	}
	output := e.Log
	if output == nil {
		output = io.Discard
	}
	progress := &composeProgress{output: output, states: map[string]string{}}
	err := e.Remote.Run(ctx, command, nil, progress)
	progress.Flush()
	return err
}
func Project(r model.Release) string {
	if r.App.Engine == "dockerfile" {
		return "sy-" + r.ID
	}
	return "sy-" + r.AppID
}
func (e *Engine) Transfer(ctx context.Context, r model.Release, source func(io.Writer) error) error {
	if err := e.command(ctx, "mkdir", "-p", r.Directory+"/source", r.Directory+"/auth"); err != nil {
		return err
	}
	reader, writer := io.Pipe()
	done := make(chan error, 1)
	go func() { err := source(writer); writer.CloseWithError(err); done <- err }()
	err := e.Remote.Run(ctx, remote.Command("tar", "-xf", "-", "-C", r.Directory+"/source"), reader, e.Log)
	reader.CloseWithError(err)
	archiveErr := <-done
	if err != nil {
		return err
	}
	if archiveErr != nil {
		return archiveErr
	}
	// Record only transferred source files. Later cleanup preserves added/changed
	// files and never traverses symlinks or erases a whole workspace directory.
	return e.command(ctx, "sh", "-c", "set -eu; find "+remote.Quote(r.Directory+"/source")+" -type f -exec sha256sum {} \\; > "+remote.Quote(r.Directory+"/.shipyard-files.sha256"))
}
func envFile(env map[string]string) []byte {
	var b strings.Builder
	keys := []string{}
	for k := range env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		b.WriteString(k + "='" + strings.ReplaceAll(env[k], "'", "\\'") + "'\n")
	}
	return []byte(b.String())
}
func (e *Engine) Build(ctx context.Context, r *model.Release, registries map[string]model.RegistryCredential) error {
	defer e.cleanupTemporary(ctx, r.Directory+"/auth/config.json", r.Directory+"/build.env")
	base := r.Directory + "/source"
	contextDir := base + "/" + r.App.Context
	file := base + "/" + r.App.File
	// Git permits symlinks; reject a context/file escaping the checked-out tree.
	if err := e.Remote.Run(ctx, "set -eu; base="+remote.Quote(base)+"; for p in "+remote.Quote(contextDir)+" "+remote.Quote(file)+`; do case "$(realpath "$p")" in "$base"/*|"$base") ;; *) echo 'Build path escapes repository'; exit 1;; esac; done`, nil, e.Log); err != nil {
		return err
	}
	if err := Write(ctx, e.Remote, r.Directory+"/build.env", envFile(r.Env)); err != nil {
		return err
	}
	if err := e.command(ctx, "mkdir", "-p", r.Directory+"/auth"); err != nil {
		return err
	}
	if err := e.command(ctx, "chmod", "700", r.Directory+"/auth"); err != nil {
		return err
	}
	auths := map[string]any{}
	for host, credential := range registries {
		auths[model.RegistryAuthKey(host)] = map[string]string{"auth": base64.StdEncoding.EncodeToString([]byte(credential.Username + ":" + credential.Password))}
	}
	b, _ := json.Marshal(map[string]any{"auths": auths})
	if err := Write(ctx, e.Remote, r.Directory+"/auth/config.json", b); err != nil {
		return err
	}
	for name, value := range r.BuildSecrets {
		if !model.ValidEnv(name) {
			return errors.New("invalid build secret ID")
		}
		defer e.cleanupTemporary(ctx, r.Directory+"/secret-"+name)
		if err := Write(ctx, e.Remote, r.Directory+"/secret-"+name, []byte(value)); err != nil {
			return err
		}
	}
	if r.App.Engine == "dockerfile" {
		tag := "shipyard/" + r.AppID + ":" + r.ID
		args := []string{"env", "DOCKER_CONFIG=" + r.Directory + "/auth", "docker", "buildx", "build", "--load", "--progress", "plain", "--tag", tag, "--file", file}
		keys := []string{}
		for k := range r.App.BuildArgs {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			args = append(args, "--build-arg", k+"="+r.App.BuildArgs[k])
		}
		for k := range r.BuildSecrets {
			args = append(args, "--secret", "id="+k+",src="+r.Directory+"/secret-"+k)
		}
		args = append(args, contextDir)
		if err := e.command(ctx, args...); err != nil {
			return err
		}
		id, err := Output(ctx, e.Remote, "docker", "image", "inspect", "--format", "{{.Id}}", tag)
		if err != nil {
			return err
		}
		r.Images = map[string]string{"app": id}
		service := map[string]any{"image": id, "environment": r.Env, "restart": "unless-stopped", "labels": map[string]string{"shipyard.app": r.AppID, "shipyard.release": r.ID}}
		config := map[string]any{"services": map[string]any{"app": service}}
		b, _ := json.Marshal(config)
		r.Compose = string(b)
	} else {
		args := []string{"env", "DOCKER_CONFIG=" + r.Directory + "/auth", "docker", "compose", "--ansi", "never", "--progress", "plain", "-p", Project(*r), "--project-directory", contextDir, "--env-file", r.Directory + "/build.env", "-f", file}
		for _, p := range r.App.Profiles {
			args = append(args, "--profile", p)
		}
		b, err := Output(ctx, e.Remote, append(args, "config", "--format", "json")...)
		if err != nil {
			return fmt.Errorf("render Compose configuration: %w", err)
		}
		var cfg map[string]any
		if err = json.Unmarshal([]byte(b), &cfg); err != nil {
			return fmt.Errorf("decode Compose configuration (%d bytes): %w", len(b), err)
		}
		if services, ok := cfg["services"].(map[string]any); ok {
			for name, raw := range services {
				service, _ := raw.(map[string]any)
				if ports, ok := service["ports"].([]any); ok && len(ports) > 0 {
					fmt.Fprintf(e.Log, "Ignoring Compose host-port publishing for service %s. Only administrator-configured published ports are applied.\n", name)
				}
				delete(service, "ports")
				if mode, _ := service["network_mode"].(string); mode != "" && mode != "none" {
					return errors.New("host and shared network modes are not supported; use managed bridge networks")
				}
			}
		}
		if r.App.PreviewOf != "" {
			if err = ValidatePreview(cfg); err != nil {
				return err
			}
		}
		services, ok := cfg["services"].(map[string]any)
		if !ok || len(services) == 0 {
			return errors.New("Compose has no enabled services")
		}
		r.Images = map[string]string{}
		for name, raw := range services {
			service, _ := raw.(map[string]any)
			profiles, _ := service["profiles"].([]any)
			if len(profiles) == 0 {
				continue
			}
			enabled := false
			for _, profile := range profiles {
				for _, selected := range r.App.Profiles {
					if selected == "*" || profile == selected {
						enabled = true
					}
				}
			}
			if !enabled {
				delete(services, name)
			} else {
				delete(service, "profiles")
			}
		}
		if len(services) == 0 {
			return errors.New("Compose has no services enabled by the selected profiles")
		}
		for name, raw := range services {
			service, ok := raw.(map[string]any)
			if !ok {
				return errors.New("invalid Compose service")
			}
			env, _ := service["environment"].(map[string]any)
			if env == nil {
				env = map[string]any{}
			}
			for k, v := range r.Env {
				env[k] = v
			}
			service["environment"] = env
			labels, _ := service["labels"].(map[string]any)
			if labels == nil {
				labels = map[string]any{}
			}
			labels["shipyard.app"] = r.AppID
			labels["shipyard.release"] = r.ID
			service["labels"] = labels
			if build, ok := service["build"].(map[string]any); ok {
				service["image"] = "shipyard/" + r.AppID + "-" + name + ":" + r.ID
				buildArgs, _ := build["args"].(map[string]any)
				if buildArgs == nil {
					buildArgs = map[string]any{}
				}
				for k, v := range r.App.BuildArgs {
					buildArgs[k] = v
				}
				build["args"] = buildArgs
				secretList, _ := build["secrets"].([]any)
				rootSecrets, _ := cfg["secrets"].(map[string]any)
				if rootSecrets == nil {
					rootSecrets = map[string]any{}
				}
				for k := range r.BuildSecrets {
					id := "shipyard_build_" + k
					rootSecrets[id] = map[string]any{"file": r.Directory + "/secret-" + k}
					secretList = append(secretList, map[string]any{"source": id, "target": k})
				}
				if len(secretList) > 0 {
					build["secrets"] = secretList
				} else {
					delete(build, "secrets")
				}
				cfg["secrets"] = rootSecrets
			}
			delete(service, "ports")
		}
		resolved, _ := json.Marshal(cfg)
		if err = Write(ctx, e.Remote, r.Directory+"/build.json", resolved); err != nil {
			return err
		}
		buildArgs := []string{"env", "DOCKER_CONFIG=" + r.Directory + "/auth", "docker", "compose", "--ansi", "never", "--progress", "plain", "-p", Project(*r), "-f", r.Directory + "/build.json"}
		if err = e.command(ctx, append(buildArgs, "build", "--pull")...); err != nil {
			return err
		}
		if err = e.command(ctx, append(buildArgs, "pull", "--ignore-buildable")...); err != nil {
			return err
		}
		for name, raw := range services {
			service := raw.(map[string]any)
			image, _ := service["image"].(string)
			if image == "" {
				return fmt.Errorf("Compose service %s has no image", name)
			}
			id, err := Output(ctx, e.Remote, "docker", "image", "inspect", "--format", "{{.Id}}", image)
			if err != nil {
				return err
			}
			tag := "shipyard/" + r.AppID + "-" + name + ":" + r.ID
			if err = e.command(ctx, "docker", "tag", id, tag); err != nil {
				return err
			}
			r.Images[name] = id
			service["image"] = id
			service["pull_policy"] = "never"
			delete(service, "build")
			delete(service, "profiles")
		}
		if rootSecrets, ok := cfg["secrets"].(map[string]any); ok {
			for k := range r.BuildSecrets {
				delete(rootSecrets, "shipyard_build_"+k)
			}
		}
		resolved, _ = json.Marshal(cfg)
		r.Compose = string(resolved)
		_ = e.command(context.WithoutCancel(ctx), "rm", "-f", r.Directory+"/build.json")
	}
	return nil
}
func portsFor(r model.Release, service string) []int {
	set := map[int]bool{}
	for _, rr := range r.Routes {
		route, err := model.Decode[model.Route](rr)
		if err != nil {
			continue
		}
		s := route.Service
		if s == "" {
			s = "app"
		}
		if s == service {
			set[route.TargetPort] = true
		}
	}
	out := []int{}
	for p := range set {
		out = append(out, p)
	}
	sort.Ints(out)
	return out
}
func (e *Engine) Start(ctx context.Context, r *model.Release) error {
	for service, id := range r.Images {
		if _, err := Output(ctx, e.Remote, "docker", "image", "inspect", id); err != nil {
			return errors.New("retained release image is missing; rollback will not rebuild it")
		}
		name := "shipyard/" + r.AppID
		if r.App.Engine == "compose" {
			name += "-" + service
		}
		if err := e.command(ctx, "docker", "tag", id, name+":"+r.ID); err != nil {
			return err
		}
	}
	var config map[string]any
	if err := json.Unmarshal([]byte(r.Compose), &config); err != nil {
		return err
	}
	services, _ := config["services"].(map[string]any)
	if e.ValidateConfig != nil {
		if err := e.ValidateConfig(ctx, *r, config); err != nil {
			return err
		}
	}
	for name, raw := range services {
		s, _ := raw.(map[string]any)
		delete(s, "ports")
		if h := r.App.Networking[name].Hostname; h != "" {
			s["hostname"] = h
		}
		ports := []any{}
		for _, p := range r.App.PublishedPorts[name] {
			ports = append(ports, map[string]any{"host_ip": p.Host, "published": p.Published, "target": p.Target, "protocol": p.Protocol})
		}
		if len(ports) > 0 {
			s["ports"] = ports
		}
		labels, _ := s["labels"].(map[string]any)
		if labels == nil {
			labels = map[string]any{}
		}
		labels["shipyard.release"] = r.ID
		labels["shipyard.app"] = r.AppID
		s["labels"] = labels
	}
	runtime, _ := json.Marshal(config)
	if err := Write(ctx, e.Remote, r.Directory+"/runtime.json", runtime); err != nil {
		return err
	}
	if err := e.command(ctx, "docker", "compose", "--ansi", "never", "--progress", "plain", "-p", Project(*r), "-f", r.Directory+"/runtime.json", "create", "--no-build", "--pull", "never", "--remove-orphans"); err != nil {
		return fmt.Errorf("start release containers: %w", err)
	}
	if e.PrepareNetworks != nil {
		items, err := e.inspect(ctx, *r)
		if err != nil {
			return err
		}
		containers := []model.NetworkContainer{}
		for _, item := range items {
			replica, _ := strconv.Atoi(item.Config.Labels["com.docker.compose.container-number"])
			containers = append(containers, model.NetworkContainer{ID: item.ID, Service: item.Config.Labels["com.docker.compose.service"], Replica: replica})
		}
		if err = e.PrepareNetworks(ctx, r, containers); err != nil {
			return fmt.Errorf("prepare container networks: %w", err)
		}
	}
	if err := e.command(ctx, "docker", "compose", "--ansi", "never", "--progress", "plain", "-p", Project(*r), "-f", r.Directory+"/runtime.json", "up", "-d", "--no-recreate", "--no-build", "--pull", "never"); err != nil {
		return err
	}
	if err := e.Discover(ctx, r); err != nil {
		return fmt.Errorf("discover release containers: %w", err)
	}
	return nil
}

type container struct {
	RestartCount int
	ID           string
	Config       struct{ Labels map[string]string }
	State        struct {
		OOMKilled bool
		Error     string
		Status    string
		ExitCode  int
		Health    *struct {
			Status string
			Log    []struct {
				ExitCode int
				Output   string
			}
		}
	}
	NetworkSettings struct {
		Networks map[string]struct {
			IPAddress         string
			GlobalIPv6Address string
		}
		Ports map[string][]struct {
			HostIP   string `json:"HostIp"`
			HostPort string
		}
	}
}

func (e *Engine) inspect(ctx context.Context, r model.Release) ([]container, error) {
	out, err := Output(ctx, e.Remote, "docker", "ps", "-aq", "--filter", "label=com.docker.compose.project="+Project(r))
	if err != nil {
		return nil, fmt.Errorf("list project containers: %w", err)
	}
	ids := strings.Fields(out)
	if len(ids) == 0 {
		return nil, errors.New("deployment has no containers")
	}
	out, err = Output(ctx, e.Remote, append([]string{"docker", "inspect"}, ids...)...)
	if err != nil {
		return nil, fmt.Errorf("inspect project containers: %w", err)
	}
	var containers []container
	err = json.Unmarshal([]byte(out), &containers)
	return containers, err
}
func (e *Engine) Discover(ctx context.Context, r *model.Release) error {
	containers, err := e.inspect(ctx, *r)
	if err != nil {
		return err
	}
	r.Containers = nil
	r.Targets = nil
	for _, c := range containers {
		r.Containers = append(r.Containers, c.ID)
		service := c.Config.Labels["com.docker.compose.service"]
		replica, _ := strconv.Atoi(c.Config.Labels["com.docker.compose.container-number"])
		for _, ep := range r.Networks {
			if ep.Service != service || ep.Replica != replica {
				continue
			}
			actual, ok := c.NetworkSettings.Networks[ep.DockerName]
			if !ok || ep.IPv4 != "" && actual.IPAddress != ep.IPv4 || ep.IPv6 != "" && actual.GlobalIPv6Address != ep.IPv6 {
				return errors.New("container does not have its reserved ingress address")
			}
			if !ep.Ingress {
				continue
			}
			address := actual.IPAddress
			if address == "" {
				address = actual.GlobalIPv6Address
			}
			for _, port := range portsFor(*r, service) {
				r.Targets = append(r.Targets, model.Target{Service: service, Container: c.ID, Port: port, Address: address, NetworkID: ep.NetworkID})
			}
		}
	}
	for _, route := range r.Routes {
		v, _ := model.Decode[model.Route](route)
		found := false
		service := v.Service
		if service == "" {
			service = "app"
		}
		for _, target := range r.Targets {
			if target.Service == service && target.Port == v.TargetPort {
				found = true
			}
		}
		if !found {
			return fmt.Errorf("route service %s has no reserved ingress endpoint; check the Compose service and redeploy", service)
		}
	}
	return nil
}
func (e *Engine) Healthy(ctx context.Context, r model.Release) error {
	timeout := r.App.HealthTimeout
	if timeout < 5 {
		timeout = 120
	}
	if timeout > 1800 {
		timeout = 1800
	}
	ctx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()
	var last error
	lastMessage := ""
	for {
		containers, err := e.inspect(ctx, r)
		healthy := err == nil
		if err != nil {
			last = err
		}
		checks := r.App.EffectiveReadiness(r.Routes)
		if err == nil {
			if err = requiredContainers(r, containers); err != nil {
				healthy = false
				last = err
			}
		}
		for _, c := range containers {
			requiresHTTP := false
			for _, check := range checks {
				if check.Service == c.Config.Labels["com.docker.compose.service"] {
					requiresHTTP = true
				}
			}
			if !requiresHTTP && r.App.Engine == "compose" && c.State.Status == "exited" && c.State.ExitCode == 0 && len(portsFor(r, c.Config.Labels["com.docker.compose.service"])) == 0 {
				continue
			}
			if c.State.Status != "running" || r.App.CheckedReadiness() && c.State.Health != nil && c.State.Health.Status != "healthy" {
				healthy = false
				message := fmt.Sprintf("%sstate=%s exit=%d restarts=%d OOM=%t", containerLabel(c), c.State.Status, c.State.ExitCode, c.RestartCount, c.State.OOMKilled)
				if c.State.Health != nil {
					message += " health=" + c.State.Health.Status
				}
				last = errors.New(message)
			}
		}
		if healthy && r.App.CheckedReadiness() && e.Dial != nil {
			probes := make([]readinessProbe, 0, len(r.Targets))
			for _, t := range r.Targets {
				probes = append(probes, readinessProbe{Target: t})
			}
			httpProbes, probeErr := httpReadinessProbes(r, containers)
			if probeErr != nil {
				healthy = false
				last = probeErr
			}
			probes = append(probes, httpProbes...)
			for _, probe := range probes {
				t := probe.Target
				address := net.JoinHostPort(t.Address, strconv.Itoa(t.Port))
				probeCtx, stop := context.WithTimeout(ctx, 3*time.Second)
				if probe.Path != "" {
					client := &http.Client{Timeout: 3 * time.Second, Transport: &http.Transport{DialContext: e.Dial}}
					req, requestErr := http.NewRequestWithContext(probeCtx, "GET", "http://"+address+probe.Path, nil)
					if requestErr != nil {
						stop()
						return requestErr
					}
					res, e := client.Do(req)
					if e != nil {
						err = e
					} else {
						res.Body.Close()
						if res.StatusCode < 200 || res.StatusCode >= 400 {
							err = fmt.Errorf("readiness HTTP %d", res.StatusCode)
						}
					}
					client.CloseIdleConnections()
				} else {
					conn, e := e.Dial(probeCtx, "tcp", address)
					err = e
					if conn != nil {
						conn.Close()
					}
				}
				stop()
				if err != nil {
					if strings.Contains(err.Error(), "administratively prohibited") {
						return errors.New("SSH server disallows forwarding to container addresses; permit local TCP forwarding to Docker bridge subnets")
					}
					healthy = false
					last = fmt.Errorf("service %s readiness %s%s: %w", t.Service, address, probe.Path, err)
					break
				}
			}
		}
		if healthy {
			return nil
		}
		if last != nil && last.Error() != lastMessage {
			lastMessage = last.Error()
			if e.Log != nil {
				fmt.Fprintf(e.Log, "Waiting for readiness: %s\n", lastMessage)
			}
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("readiness deadline exceeded: %v", last)
		case <-time.After(time.Second):
		}
	}
}
func (e *Engine) Action(ctx context.Context, r model.Release, action string) error {
	switch action {
	case "start", "stop", "restart":
		return e.command(ctx, "docker", "compose", "--ansi", "never", "--progress", "plain", "-p", Project(r), "-f", r.Directory+"/runtime.json", action)
	default:
		return errors.New("unsupported application action")
	}
}
func (e *Engine) Remove(ctx context.Context, r model.Release, volumes bool) error {
	args := []string{"docker", "compose", "--ansi", "never", "--progress", "plain", "-p", Project(r), "-f", r.Directory + "/runtime.json", "down", "--remove-orphans"}
	if volumes {
		if r.App.PreviewOf == "" {
			return errors.New("only preview volumes can be removed")
		}
		args = append(args, "--volumes")
	}
	// Repeated cleanup must still work after a prior attempt removed durable
	// release files. Compose labels identify only this managed project.
	projectFilter := remote.Quote("label=com.docker.compose.project=" + Project(r))
	script := "set -eu; if [ -f " + remote.Quote(r.Directory+"/runtime.json") + " ]; then " + remote.Command(args...) + "; else\n" +
		"docker ps -aq --filter " + projectFilter + " | while IFS= read -r id; do docker rm -f \"$id\"; done\n" +
		"docker network ls -q --filter " + projectFilter + " | while IFS= read -r id; do docker network rm \"$id\"; done\n"
	if volumes {
		script += "docker volume ls -q --filter " + projectFilter + " | while IFS= read -r id; do docker volume rm \"$id\"; done\n"
	}
	script += "fi"
	return e.runComposeProgress(ctx, remote.Command("sh", "-c", script))
}

// Resource deletion must work even if a retained Compose file references host
// files that no longer exist. Remove only objects labelled with this project;
// do not remove named or anonymous volumes, external networks or other stacks.
func (e *Engine) RemoveProject(ctx context.Context, r model.Release) error {
	filter := remote.Quote("label=com.docker.compose.project=" + Project(r))
	script := "set -eu; containers=$(docker ps -aq --filter " + filter + "); for id in $containers; do docker rm -f \"$id\"; done\n" +
		"networks=$(docker network ls -q --filter " + filter + "); for id in $networks; do docker network rm \"$id\"; done"
	return e.Remote.Run(ctx, remote.Command("sh", "-c", script), nil, e.Log)
}
func ValidatePreview(cfg map[string]any) error {
	project, _ := cfg["name"].(string)
	for _, kind := range []string{"volumes", "networks"} {
		items, _ := cfg[kind].(map[string]any)
		for name, raw := range items {
			m, _ := raw.(map[string]any)
			if external, _ := m["external"].(bool); external {
				return fmt.Errorf("preview %s %s is external", kind, name)
			}
			if global, _ := m["name"].(string); global != "" && (project == "" || global != project+"_"+name) {
				return fmt.Errorf("preview %s %s has a global name", kind, name)
			}
		}
	}
	services, _ := cfg["services"].(map[string]any)
	for name, raw := range services {
		s, _ := raw.(map[string]any)
		if s["container_name"] != nil || s["network_mode"] != nil || s["pid"] != nil || s["ipc"] != nil {
			return fmt.Errorf("preview service %s uses fixed container identity or host namespaces", name)
		}
		if privileged, _ := s["privileged"].(bool); privileged {
			return fmt.Errorf("preview service %s is privileged", name)
		}
		if lenAny(s["devices"])+lenAny(s["cap_add"]) > 0 {
			return fmt.Errorf("preview service %s requests host privileges", name)
		}
		ports, _ := s["ports"].([]any)
		for _, p := range ports {
			v, ok := p.(map[string]any)
			if !ok {
				return fmt.Errorf("preview service %s has an unsupported port mapping", name)
			}
			if published, ok := v["published"]; ok && fmt.Sprint(published) != "" && fmt.Sprint(published) != "0" {
				return fmt.Errorf("preview service %s publishes a fixed port", name)
			}
		}
		volumes, _ := s["volumes"].([]any)
		for _, v := range volumes {
			m, _ := v.(map[string]any)
			if m["type"] == "bind" {
				return fmt.Errorf("preview service %s uses a host bind mount; use project-scoped named volumes", name)
			}
		}
	}
	return nil
}
func lenAny(v any) int {
	if list, ok := v.([]any); ok {
		return len(list)
	}
	return 0
}
