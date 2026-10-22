package deploy

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"strconv"
	"strings"
	"sync"
)

// JobCompose reduces a rendered document to exactly one independently runnable service.
func JobCompose(r model.Release, cfg map[string]any) error {
	services, _ := cfg["services"].(map[string]any)
	name := r.App.JobTarget()
	service, ok := services[name].(map[string]any)
	if !ok {
		return fmt.Errorf("Job target service %q is not enabled", name)
	}
	for _, key := range []string{"volumes_from", "links", "external_links", "container_name", "pid", "ipc"} {
		if service[key] != nil {
			return fmt.Errorf("Job service does not support %s", key)
		}
	}
	if mode, _ := service["network_mode"].(string); mode != "" && mode != "none" {
		return errors.New("Jobs require independent bridge networking")
	}
	if replicas, ok := service["scale"].(float64); ok && replicas != 1 {
		return errors.New("Jobs require one replica")
	}
	if d, ok := service["deploy"].(map[string]any); ok {
		if replicas, ok := d["replicas"].(float64); ok && replicas != 1 {
			return errors.New("Jobs require one replica")
		}
		delete(d, "restart_policy")
		delete(d, "mode")
	}
	if networks, ok := service["networks"].(map[string]any); ok {
		for _, raw := range networks {
			n, _ := raw.(map[string]any)
			if n["ipv4_address"] != nil || n["ipv6_address"] != nil {
				return errors.New("Jobs require dynamic network addresses")
			}
		}
	}
	delete(service, "depends_on")
	delete(service, "ports")
	delete(service, "healthcheck")
	service["restart"] = "no"
	cfg["services"] = map[string]any{name: service}
	// Rendered named volumes retain their application project names across attempts.
	return nil
}
func (e *Engine) PrepareJob(ctx context.Context, r *model.Release) error {
	if err := e.PinImages(ctx, *r); err != nil {
		return err
	}
	var cfg map[string]any
	if err := json.Unmarshal([]byte(r.Compose), &cfg); err != nil {
		return err
	}
	if err := JobCompose(*r, cfg); err != nil {
		return err
	}
	if e.ValidateConfig != nil {
		if err := e.ValidateConfig(ctx, *r, cfg); err != nil {
			return err
		}
	}
	b, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	r.Compose = string(b)
	return nil
}
func JobProject(a model.JobAttempt) string { return "syj-" + a.Container }
func MatchesProject(r model.Release, labels map[string]string) bool {
	if labels["com.docker.compose.project"] == Project(r) {
		return true
	}
	if !r.App.IsJob() {
		return false
	}
	if _, err := strconv.Atoi(labels["shipyard.attempt"]); err != nil {
		return false
	}
	return labels["shipyard.run"] != "" && labels["com.docker.compose.project"] == "syj-syjob-"+labels["shipyard.run"]+"-"+labels["shipyard.attempt"]
}
func JobFile(r model.Release, a model.JobAttempt) string {
	return r.Directory + "/" + a.Container + ".json"
}
func (e *Engine) StartJob(ctx context.Context, r model.Release, a model.JobAttempt, id string) error {
	// mkdir is the host-side atomic start claim. A lost response can never issue
	// a second start after a short-lived container has already exited.
	marker := r.Directory + "/start-intent-" + a.Container
	fence := r.Directory + "/stop-intent-" + a.Container
	script := "set -eu; test ! -e " + remote.Quote(fence) + "; if mkdir " + remote.Quote(marker) + " 2>/dev/null; then test ! -e " + remote.Quote(fence) + "; " + remote.Command("docker", "start", id) + "; else state=$(" + remote.Command("docker", "inspect", "--format", "{{.State.Status}}", id) + "); test \"$state\" != created; fi"
	return e.command(ctx, "sh", "-c", script)
}
func (e *Engine) FenceJob(ctx context.Context, r model.Release, a model.JobAttempt) error {
	return Write(ctx, e.Remote, r.Directory+"/stop-intent-"+a.Container, []byte("stopped\n"))
}
func (e *Engine) CreateJob(ctx context.Context, r *model.Release, run model.JobRun, a model.JobAttempt) error {
	var cfg map[string]any
	if err := json.Unmarshal([]byte(r.Compose), &cfg); err != nil {
		return err
	}
	if err := JobCompose(*r, cfg); err != nil {
		return err
	}
	name := r.App.JobTarget()
	service := cfg["services"].(map[string]any)[name].(map[string]any)
	if err := e.prepareJobVolumes(ctx, *r, cfg); err != nil {
		return err
	}
	service["container_name"] = a.Container
	labels, _ := service["labels"].(map[string]any)
	if labels == nil {
		labels = map[string]any{}
	}
	labels["shipyard.app"] = r.AppID
	labels["shipyard.release"] = r.ID
	labels["shipyard.run"] = run.ID
	labels["shipyard.attempt"] = fmt.Sprint(a.Number)
	service["labels"] = labels
	if hostname := r.App.Networking[name].Hostname; hostname != "" {
		service["hostname"] = hostname
	}
	if networks, ok := cfg["networks"].(map[string]any); ok {
		for key, raw := range networks {
			n, _ := raw.(map[string]any)
			external, _ := n["external"].(bool)
			if !external {
				n["name"] = JobProject(a) + "_" + key
			}
		}
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	if err = Write(ctx, e.Remote, JobFile(*r, a), raw); err != nil {
		return err
	}
	return e.command(ctx, "docker", "compose", "-p", JobProject(a), "-f", JobFile(*r, a), "create", "--no-recreate", "--no-build", "--pull", "never", name)
}

func (e *Engine) prepareJobVolumes(ctx context.Context, r model.Release, cfg map[string]any) error {
	volumes, _ := cfg["volumes"].(map[string]any)
	for key, raw := range volumes {
		v, _ := raw.(map[string]any)
		external, _ := v["external"].(bool)
		if external {
			continue
		}
		name, _ := v["name"].(string)
		if name == "" {
			name = Project(r) + "_" + key
		}
		found, err := Output(ctx, e.Remote, "docker", "volume", "ls", "-q", "--filter", "name=^"+name+"$")
		if err != nil {
			return err
		}
		if found == "" {
			args := []string{"docker", "volume", "create", "--label", "com.docker.compose.project=" + Project(r), "--label", "com.docker.compose.volume=" + key, "--label", "shipyard.app=" + r.AppID}
			if driver, _ := v["driver"].(string); driver != "" {
				args = append(args, "--driver", driver)
			}
			if opts, ok := v["driver_opts"].(map[string]any); ok {
				for k, value := range opts {
					args = append(args, "--opt", k+"="+fmt.Sprint(value))
				}
			}
			if labels, ok := v["labels"].(map[string]any); ok {
				for k, value := range labels {
					if !strings.HasPrefix(k, "com.docker.compose.") && k != "shipyard.app" {
						args = append(args, "--label", k+"="+fmt.Sprint(value))
					}
				}
			}
			if err = e.command(ctx, append(args, name)...); err != nil {
				return err
			}
		}
		// Runtime references the prepared volume; the release retains its original ownership metadata.
		volumes[key] = map[string]any{"name": name, "external": true}
	}
	return nil
}

type JobContainer struct {
	ID     string `json:"Id"`
	Config struct {
		Labels      map[string]string
		StopTimeout *int
		StopSignal  string
	} `json:"Config"`
	State struct {
		Status     string
		ExitCode   int
		StartedAt  string
		FinishedAt string
		OOMKilled  bool
	} `json:"State"`
}

func (e *Engine) InspectJob(ctx context.Context, a model.JobAttempt) (*JobContainer, error) {
	// Listing first distinguishes confirmed absence from Docker/SSH unavailability.
	id, err := Output(ctx, e.Remote, "docker", "ps", "-aq", "--no-trunc", "--filter", "name=^/"+a.Container+"$")
	if err != nil {
		return nil, err
	}
	if id == "" {
		return nil, nil
	}
	raw, err := Output(ctx, e.Remote, "docker", "inspect", id)
	if err != nil {
		return nil, err
	}
	var items []JobContainer
	if err = json.Unmarshal([]byte(raw), &items); err != nil {
		return nil, err
	}
	if len(items) != 1 {
		return nil, errors.New("ambiguous Job container")
	}
	return &items[0], nil
}
func (e *Engine) JobLogs(ctx context.Context, a model.JobAttempt) (string, error) {
	// Bound both memory and remote work. Cancelling this reader stops only docker logs.
	read, cancel := context.WithCancel(ctx)
	defer cancel()
	w := &jobLogPrefix{cancel: cancel}
	err := e.Remote.Run(read, remote.Command("sh", "-c", "exec docker logs --timestamps "+remote.Quote(a.Container)+" 2>&1"), nil, w)
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.full && ctx.Err() == nil {
		err = nil
	}
	return w.buffer.String(), err
}

type jobLogPrefix struct {
	mu     sync.Mutex
	buffer bytes.Buffer
	full   bool
	cancel context.CancelFunc
}

func (w *jobLogPrefix) Write(b []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	n := len(b)
	remaining := 1048577 - w.buffer.Len()
	if len(b) > remaining {
		b = b[:remaining]
	}
	_, _ = w.buffer.Write(b)
	if w.buffer.Len() == 1048577 {
		w.full = true
		w.cancel()
	}
	return n, nil
}
func (e *Engine) CleanupJob(ctx context.Context, r model.Release, a model.JobAttempt) error {
	if err := e.Remote.Run(ctx, "test -f "+remote.Quote(JobFile(r, a)), nil, io.Discard); err != nil {
		// Listing must succeed before absence can be treated as completed cleanup.
		networks, err := Output(ctx, e.Remote, "docker", "network", "ls", "-q", "--filter", "label=com.docker.compose.project="+JobProject(a))
		if err != nil {
			return err
		}
		for _, id := range strings.Fields(networks) {
			if err = e.command(ctx, "docker", "network", "rm", id); err != nil {
				return err
			}
		}
		return nil
	}
	// One unique project per attempt. Never request volume removal from Compose.
	if err := e.command(ctx, "docker", "compose", "-p", JobProject(a), "-f", JobFile(r, a), "down", "--remove-orphans"); err != nil {
		return err
	}
	// docker rm -v before down is handled by the controller for anonymous volumes.
	return e.Remote.Run(ctx, remote.Command("rm", "-f", JobFile(r, a)), nil, io.Discard)
}
