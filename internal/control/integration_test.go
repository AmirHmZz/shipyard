package control

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"github.com/coder/websocket"
	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"io"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/proxy"
	"shipyard/internal/remote"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type localGit struct {
	binary  []byte
	version string
	compose bool
}

func (g *localGit) Repositories(context.Context) ([]providers.Repository, error) { return nil, nil }
func (g *localGit) Branches(context.Context, string) ([]providers.Branch, error) { return nil, nil }
func (g *localGit) Checkout(ctx context.Context, repo, ref, dir string) (string, error) {
	files := map[string][]byte{"backend": g.binary, "Dockerfile": []byte("FROM scratch\nCOPY backend /backend\nARG VERSION\nENV VERSION=$VERSION\nENTRYPOINT [\"/backend\"]\n")}
	if g.compose {
		files["compose.yaml"] = []byte("services:\n  web:\n    build: .\n    environment:\n      STATE_DIR: /state\n    ports:\n      - '127.0.0.1::8080'\n    volumes:\n      - state:/state\n  debug:\n    build: .\n    profiles: [debug]\nvolumes:\n  state: {}\n")
	}
	for name, b := range files {
		if e := os.WriteFile(filepath.Join(dir, name), b, 0700); e != nil {
			return "", e
		}
	}
	for _, args := range [][]string{{"init", "--quiet"}, {"config", "user.email", "integration@shipyard.invalid"}, {"config", "user.name", "Shipyard integration"}, {"add", "."}, {"commit", "--quiet", "-m", g.version}} {
		cmd := exec.CommandContext(ctx, "git", args...)
		cmd.Dir = dir
		if b, e := cmd.CombinedOutput(); e != nil {
			return "", fmt.Errorf("git: %w: %s", e, b)
		}
	}
	cmd := exec.CommandContext(ctx, "git", "rev-parse", "HEAD")
	cmd.Dir = dir
	b, e := cmd.Output()
	if model.ValidSHA(ref) {
		return ref, e
	}
	return strings.TrimSpace(string(b)), e
}
func docker(t *testing.T, input io.Reader, args ...string) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Stdin = input
	b, e := cmd.CombinedOutput()
	if e != nil {
		t.Fatalf("docker %v: %v\n%s", args, e, b)
	}
	return strings.TrimSpace(string(b))
}
func certificate(t *testing.T) ([]byte, *x509.CertPool) {
	t.Helper()
	key, e := rsa.GenerateKey(rand.Reader, 2048)
	if e != nil {
		t.Fatal(e)
	}
	template := &x509.Certificate{SerialNumber: big.NewInt(44), Subject: pkix.Name{CommonName: "Shipyard integration"}, DNSNames: []string{"app.example.com", "grpc.example.com", "tcp.example.com", "compose.example.com", "raw.example.com", "*.example.com", "*.sub.example.com"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, e := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if e != nil {
		t.Fatal(e)
	}
	cert := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(cert)
	return append(cert, pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})...), pool
}
func TestLinuxDeploymentRollbackAndProtocols(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" {
		t.Skip("set SHIPYARD_INTEGRATION=1 with isolated Docker access")
	}
	c := testController(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	host := os.Getenv("SHIPYARD_FIXTURE_HOST")
	var key *rsa.PrivateKey
	if host != "" {
		raw, e := os.ReadFile(os.Getenv("SHIPYARD_FIXTURE_PRIVATE_KEY_FILE"))
		if e != nil {
			t.Fatal(e)
		}
		parsed, e := ssh.ParseRawPrivateKey(raw)
		if e != nil {
			t.Fatal(e)
		}
		var ok bool
		key, ok = parsed.(*rsa.PrivateKey)
		if !ok {
			t.Fatal("integration fixture requires an RSA key")
		}
	} else {
		name := "shipyard-fixture-" + uuid.NewString()[:8]
		network := os.Getenv("SHIPYARD_TEST_NETWORK")
		if network == "" {
			network = "bridge"
		}
		docker(t, nil, "run", "-d", "--privileged", "--name", name, "--network", network, "-e", "DOCKER_TLS_CERTDIR=", "docker:29-dind")
		t.Cleanup(func() { cmd := exec.Command("docker", "rm", "-fv", name); _ = cmd.Run() })
		for i := 0; i < 90; i++ {
			cmd := exec.CommandContext(ctx, "docker", "exec", name, "docker", "info")
			if cmd.Run() == nil {
				break
			}
			if i == 89 {
				t.Fatal("nested Docker did not start")
			}
			time.Sleep(time.Second)
		}
		docker(t, nil, "exec", name, "sh", "-c", "apk add --no-cache openssh && ssh-keygen -A && mkdir -p /root/.ssh && chmod 700 /root/.ssh")
		var e error
		key, e = rsa.GenerateKey(rand.Reader, 2048)
		if e != nil {
			t.Fatal(e)
		}
		signer, e := ssh.NewSignerFromKey(key)
		if e != nil {
			t.Fatal(e)
		}
		docker(t, bytes.NewReader(ssh.MarshalAuthorizedKey(signer.PublicKey())), "exec", "-i", name, "sh", "-c", "cat > /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys")
		docker(t, nil, "exec", name, "/usr/sbin/sshd", "-p", "2222", "-o", "PermitRootLogin=prohibit-password", "-o", "PasswordAuthentication=no", "-o", "AllowTcpForwarding=yes")
		host = name
		if network == "bridge" {
			host = docker(t, nil, "inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", name)
		}
	}
	fingerprint, e := remote.Fingerprint(ctx, host, 2222)
	if e != nil {
		t.Fatal(e)
	}
	binaryPath := filepath.Join(t.TempDir(), "backend")
	cmd := exec.CommandContext(ctx, "go", "build", "-o", binaryPath, "../../tests/fixture")
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0")
	if b, e := cmd.CombinedOutput(); e != nil {
		t.Fatalf("build fixture: %v: %s", e, b)
	}
	binary, e := os.ReadFile(binaryPath)
	if e != nil {
		t.Fatal(e)
	}
	source := &localGit{binary: binary, version: "first"}
	c.GitFactory = func(model.Git, map[string]string) providers.GitProvider { return source }
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	project := resource(t, c, "project", team.ID, team.ID, map[string]any{}, nil)
	env := resource(t, c, "environment", project.ID, team.ID, map[string]any{}, nil)
	server := resource(t, c, "server", "", "", model.Server{Host: host, Port: 2222, User: "root", Fingerprint: fingerprint, IPv4: "192.0.2.1"}, map[string]string{"private_key": string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))})
	git := resource(t, c, "git", "", "", model.Git{Provider: "gitea", URL: "https://git.invalid"}, nil)
	for _, id := range []string{server.ID, git.ID} {
		if _, e = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", id, team.ID); e != nil {
			t.Fatal(e)
		}
	}
	spec := model.App{Engine: "dockerfile", ServerID: server.ID, GitID: git.ID, Repository: "owner/repo", Branch: "main", Context: ".", File: "Dockerfile", Port: 8080, HealthTimeout: 15, BuildArgs: map[string]string{"VERSION": "first"}}
	app := resource(t, c, "application", env.ID, team.ID, spec, map[string]string{"env:API_SECRET": "must-not-appear"})
	cert, pool := certificate(t)
	routes := []model.Route{{Protocol: "https", Domain: "app.example.com", Service: "app", TargetPort: 8080, TLS: "terminate"}, {Protocol: "grpc", Domain: "grpc.example.com", Service: "app", TargetPort: 9090, TLS: "terminate"}, {Protocol: "tcp", Service: "app", TargetPort: 7000, ListenPort: 15432, TLS: "terminate", Domain: "tcp.example.com"}, {Protocol: "tcp", Domain: "tcp.example.com", Service: "app", TargetPort: 7000, ListenPort: 15433, TLS: "terminate"}, {Protocol: "tcp", Service: "app", TargetPort: 7001, ListenPort: 15434, TLS: "passthrough"}}
	dns := resource(t, c, "dns", "", "", model.DNS{Provider: "cloudflare"}, nil)
	zone := resource(t, c, "zone", dns.ID, "", model.Zone{Domain: "example.com", ProviderZoneID: "zone"}, nil)
	tcpFrontends := map[int]string{}
	for _, route := range routes {
		r := resource(t, c, "route", app.ID, team.ID, route, nil)
		if route.Protocol == "tcp" {
			tcpFrontends[route.ListenPort] = r.ID
		}
		if route.TLS == "terminate" {
			encrypted, _ := c.Store.Vault.Seal(cert, "certificate:"+r.ID)
			_, e = c.Store.Pool.Exec(ctx, "INSERT INTO domain_state(route_id,zone_id,domain,certificate,expires_at,dns_state,certificate_state) VALUES($1,$2,$3,$4,now()+interval '1 hour','ready','ready')", r.ID, zone.ID, route.Domain, encrypted)
			if e != nil {
				t.Fatal(e)
			}
		}
	}
	run := func(app model.Resource, rollback string) model.Deployment {
		t.Helper()
		d, e := c.Queue(ctx, app, "main", rollback)
		if e != nil {
			t.Fatal(e)
		}
		if e = c.deploy(ctx, d.ID); e != nil {
			events, _ := c.Store.Events(ctx, d.ID, 0)
			t.Fatalf("deployment: %v\n%+v", e, events)
		}
		d, e = c.Store.Deployment(ctx, d.ID)
		if e != nil || d.State != "healthy" {
			t.Fatal(d, e)
		}
		return d
	}
	first := run(app, "")
	dial := func(ctx context.Context, network, address string) (net.Conn, error) {
		_, port, _ := net.SplitHostPort(address)
		return (&net.Dialer{}).DialContext(ctx, network, net.JoinHostPort(host, port))
	}
	httpClient := &http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}, DialContext: dial}}
	get := func() (map[string]string, error) {
		res, e := httpClient.Get("https://app.example.com/api/hello")
		if e != nil {
			return nil, e
		}
		defer res.Body.Close()
		var result map[string]string
		e = json.NewDecoder(res.Body).Decode(&result)
		return result, e
	}
	body, e := get()
	if e != nil || body["version"] != "first" || body["path"] != "/api/hello" {
		t.Fatal("HTTP/TLS/domain route", body, e)
	}
	ws, _, e := websocket.Dial(ctx, "wss://app.example.com/ws", &websocket.DialOptions{HTTPClient: httpClient})
	if e != nil {
		t.Fatal("WebSocket", e)
	}
	if e = ws.Write(ctx, websocket.MessageText, []byte("websocket")); e != nil {
		t.Fatal(e)
	}
	_, message, e := ws.Read(ctx)
	if e != nil || string(message) != "websocket" {
		t.Fatal("WebSocket echo", e)
	}
	ws.Close(websocket.StatusNormalClosure, "done")
	rpc, e := grpc.NewClient("passthrough:///grpc.example.com:443", grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{RootCAs: pool, ServerName: "grpc.example.com", MinVersion: tls.VersionTLS12})), grpc.WithContextDialer(func(ctx context.Context, address string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "tcp", net.JoinHostPort(host, "443"))
	}))
	if e != nil {
		t.Fatal(e)
	}
	defer rpc.Close()
	health := healthpb.NewHealthClient(rpc)
	rpcCtx, stop := context.WithTimeout(ctx, 10*time.Second)
	defer stop()
	if _, e = health.Check(rpcCtx, &healthpb.HealthCheckRequest{Service: "fixture"}); e != nil {
		t.Fatal("gRPC unary", e)
	}
	stream, e := health.Watch(rpcCtx, &healthpb.HealthCheckRequest{Service: "fixture"})
	if e != nil {
		t.Fatal(e)
	}
	for i := 0; i < 2; i++ {
		if _, e = stream.Recv(); e != nil {
			t.Fatal("gRPC stream", e)
		}
	}
	for _, port := range []string{"15432", "15433", "15434"} {
		var conn net.Conn

		config := &tls.Config{RootCAs: pool, ServerName: "tcp.example.com", MinVersion: tls.VersionTLS12}
		if port == "15434" {
			config.InsecureSkipVerify = true
		}
		conn, e = tls.DialWithDialer(&net.Dialer{Timeout: 5 * time.Second}, "tcp", net.JoinHostPort(host, port), config)
		if e != nil {
			t.Fatal("TCP", port, e)
		}
		conn.SetDeadline(time.Now().Add(5 * time.Second))
		_, _ = io.WriteString(conn, "message\n")
		response, e := bufio.NewReader(conn).ReadString('\n')
		conn.Close()
		if e != nil || response != "echo:message\n" {
			t.Fatal("TCP echo", port, response, e)
		}
	}
	t.Log("HTTPS, unchanged request paths, WebSocket, gRPC unary/streaming and both TCP TLS modes passed")
	var failures atomic.Int64
	trafficCtx, trafficStop := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			select {
			case <-trafficCtx.Done():
				return
			default:
				if _, e := get(); e != nil {
					failures.Add(1)
				}
				time.Sleep(20 * time.Millisecond)
			}
		}
	}()
	source.version = "second"
	spec.BuildArgs["VERSION"] = "second"
	app.Data, _ = json.Marshal(spec)
	app, e = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, ParentID: app.ParentID, TeamID: app.TeamID, Data: app.Data, Version: app.Version})
	if e != nil {
		t.Fatal(e)
	}
	run(app, "")
	trafficStop()
	<-done
	if failures.Load() != 0 {
		t.Fatal("requests failed during replacement", failures.Load())
	}
	body, e = get()
	if e != nil || body["version"] != "second" {
		t.Fatal(body, e)
	}
	run(app, first.ReleaseID)
	body, e = get()
	if e != nil || body["version"] != "first" {
		t.Fatal("exact-image rollback failed", body, e)
	}
	t.Log("continuous HTTP traffic during replacement and exact-image rollback passed")
	source.version = "bad"
	spec.BuildArgs["VERSION"] = "bad"
	spec.HealthPath = "/fail"
	spec.HealthTimeout = 5
	app.Data, _ = json.Marshal(spec)
	app, e = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: app.Version})
	if e != nil {
		t.Fatal(e)
	}
	failed, e := c.Queue(ctx, app, "main", "")
	if e != nil {
		t.Fatal(e)
	}
	if e = c.deploy(ctx, failed.ID); e == nil {
		t.Fatal("unhealthy deployment accepted")
	}
	body, e = get()
	if e != nil || body["version"] != "first" {
		t.Fatal("automatic recovery lost old release", body, e)
	}
	client, _, e := c.connect(ctx, server.ID)
	if e != nil {
		t.Fatal(e)
	}
	defer client.Close()
	if e = proxy.Apply(ctx, client, "invalid HAProxy configuration", map[string][]byte{}, io.Discard); e == nil {
		t.Fatal("invalid configuration accepted")
	}
	body, e = get()
	if e != nil || body["version"] != "first" {
		t.Fatal("invalid config disturbed active route", body, e)
	}
	t.Log("automatic recovery and HAProxy validation preserve the previous release")
	// Exercise the settings job on the real destination host, independently
	// binding the web frontend and one TCP frontend.
	hostIP, err := net.ResolveIPAddr("ip4", host)
	if err != nil {
		t.Fatal(err)
	}
	applyBindings := func(version int, bindings proxy.Bindings, expected string) {
		t.Helper()
		if _, err := c.QueueProxySettings(ctx, server.ID, "integration", ProxySettingsInput{Version: version, Bindings: bindings}); err != nil {
			t.Fatal(err)
		}
		job, err := c.Store.Claim(ctx, "integration-proxy", "proxy-settings")
		if err != nil {
			t.Fatal(err)
		}
		c.runJob(ctx, job, "integration-proxy")
		var state, detail string
		if err = c.Store.Pool.QueryRow(ctx, "SELECT state,last_error FROM jobs WHERE id=$1", job.ID).Scan(&state, &detail); err != nil {
			t.Fatal(err)
		}
		if state != expected {
			t.Fatalf("proxy apply: expected %s, got %s: %s", expected, state, detail)
		}
	}
	customBindings := proxy.Bindings{"web": {hostIP.IP.String()}, tcpFrontends[15432]: {"127.0.0.1"}}
	applyBindings(0, customBindings, "done")
	if _, err = net.DialTimeout("tcp", net.JoinHostPort(host, "15432"), time.Second); err == nil {
		t.Fatal("loopback TCP frontend remained publicly reachable")
	}
	local, err := client.DialContext(ctx, "tcp", "127.0.0.1:15432")
	if err != nil {
		t.Fatal(err)
	}
	local = tls.Client(local, &tls.Config{RootCAs: pool, ServerName: "tcp.example.com", MinVersion: tls.VersionTLS12})
	if err = local.(*tls.Conn).HandshakeContext(ctx); err != nil {
		t.Fatal(err)
	}
	_ = local.SetDeadline(time.Now().Add(5 * time.Second))
	_, _ = io.WriteString(local, "custom\n")
	echo, err := bufio.NewReader(local).ReadString('\n')
	local.Close()
	if err != nil || echo != "echo:custom\n" {
		t.Fatal("custom TCP binding", echo, err)
	}
	applyBindings(1, proxy.Bindings{"web": {"203.0.113.254"}}, "failed")
	settings, err := c.ProxyState(ctx, server.ID)
	if err != nil || settings.Version != 1 || settings.Bindings["web"][0] != hostIP.IP.String() {
		t.Fatal("failed binding committed", settings, err)
	}
	if _, err = get(); err != nil {
		t.Fatal("failed bind lost working HTTPS route", err)
	}
	// Simulate interruption after file promotion but before reload. Recovery
	// must use the prior generation before creating another backup.
	if err = client.Run(ctx, "cd /var/lib/shipyard/proxy && cp haproxy.cfg previous.cfg && rm -rf previous-certs && cp -a certs previous-certs && echo existing > pending", nil, io.Discard); err != nil {
		t.Fatal(err)
	}
	if err = deploy.Write(ctx, client, remote.Root+"/proxy/haproxy.cfg", []byte("interrupted invalid candidate")); err != nil {
		t.Fatal(err)
	}
	if err = c.syncProxy(ctx, server.ID, nil); err != nil {
		t.Fatal("interrupted proxy recovery", err)
	}
	if _, err = get(); err != nil {
		t.Fatal("recovery lost HTTPS", err)
	}
	t.Log("HAProxy 3.4 binding settings, failed bind recovery and interrupted reload recovery passed")
	source.compose = true
	source.version = "compose-first"
	composeSpec := spec
	composeSpec.Engine = "compose"
	composeSpec.File = "compose.yaml"
	composeSpec.HealthPath = ""
	composeSpec.Previews = true
	composeSpec.PreviewDomain = "*.preview.example.com"
	composeSpec.PreviewZoneID = zone.ID
	composeSpec.BuildArgs = map[string]string{"VERSION": "compose-first"}
	compose := resource(t, c, "application", env.ID, team.ID, composeSpec, nil)
	composeRoute := resource(t, c, "route", compose.ID, team.ID, model.Route{Protocol: "https", Domain: "compose.example.com", Service: "web", TargetPort: 8080, TLS: "terminate"}, nil)
	composeCert, _ := c.Store.Vault.Seal(cert, "certificate:"+composeRoute.ID)
	if _, err = c.Store.Pool.Exec(ctx, "INSERT INTO domain_state(route_id,zone_id,domain,certificate,expires_at,dns_state,certificate_state) VALUES($1,$2,$3,$4,now()+interval '1 hour','ready','ready')", composeRoute.ID, zone.ID, "compose.example.com", composeCert); err != nil {
		t.Fatal(err)
	}
	composeFirst := run(compose, "")
	currentConfig, err := deploy.Output(ctx, client, "cat", remote.Root+"/proxy/haproxy.cfg")
	if err != nil || !strings.Contains(currentConfig, "bind "+hostIP.IP.String()+":443") || !strings.Contains(currentConfig, "bind 127.0.0.1:15432") {
		t.Fatal("deployment discarded frontend bindings", err, currentConfig)
	}
	composeGet := func() map[string]string {
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://compose.example.com/", nil)
		req.Host = "compose.example.com"
		res, e := httpClient.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		var value map[string]string
		if e = json.NewDecoder(res.Body).Decode(&value); e != nil {
			t.Fatal(e)
		}
		return value
	}
	if value := composeGet(); value["state"] != "compose-first" {
		t.Fatal("initial volume", value)
	}
	source.version = "compose-second"
	composeSpec.BuildArgs["VERSION"] = "compose-second"
	compose.Data, _ = json.Marshal(composeSpec)
	compose, e = c.Store.Save(ctx, compose.ID, model.ResourceInput{Kind: compose.Kind, Name: compose.Name, Data: compose.Data, Version: compose.Version})
	if e != nil {
		t.Fatal(e)
	}
	run(compose, "")
	if value := composeGet(); value["version"] != "compose-second" || value["state"] != "compose-first" {
		t.Fatal("Compose volume lost during deployment", value)
	}
	run(compose, composeFirst.ReleaseID)
	if value := composeGet(); value["version"] != "compose-first" || value["state"] != "compose-first" {
		t.Fatal("Compose rollback changed data", value)
	}
	active, err := c.Store.Active(ctx, compose.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := active.Images["debug"]; ok {
		t.Fatal("disabled Compose profile was deployed")
	}
	for _, container := range active.Containers {
		bindings, err := deploy.Output(ctx, client, "docker", "inspect", "--format", "{{json .NetworkSettings.Ports}}", container)
		if err != nil {
			t.Fatal(err)
		}
		var ports map[string][]map[string]string
		if json.Unmarshal([]byte(bindings), &ports) != nil || len(ports["8080/tcp"]) != 0 {
			t.Fatal("managed endpoint was exposed publicly or duplicated", bindings)
		}
	}
	t.Log("Compose volume preservation and profile selection passed")

	// Preview stacks use separate project networks/volumes and never inherit a
	// production stack's state. Closing one leaves the other running.
	sha := strings.Repeat("a", 40)
	previewSpec := composeSpec
	previewSpec.PreviewOf = compose.ID
	previewSpec.Previews = false
	previewSpec.PreviewSHA = sha
	previewSpec.ApprovedSHA = sha
	previewSpec.PR = 1
	previewSpec.BuildArgs = map[string]string{"VERSION": "preview-one"}
	preview := resource(t, c, "application", env.ID, team.ID, previewSpec, nil)
	previewSpec.PR = 2
	previewSpec.BuildArgs = map[string]string{"VERSION": "preview-two"}
	other := resource(t, c, "application", env.ID, team.ID, previewSpec, nil)
	for _, p := range []model.Resource{preview, other} {
		d, err := c.Queue(ctx, p, sha, "")
		if err != nil {
			t.Fatal(err)
		}
		if err = c.deploy(ctx, d.ID); err != nil {
			t.Fatal(err)
		}
	}
	firstPreview, err := c.Store.Active(ctx, preview.ID)
	if err != nil {
		t.Fatal(err)
	}
	otherPreview, err := c.Store.Active(ctx, other.ID)
	if err != nil {
		t.Fatal(err)
	}
	if firstPreview.Images["web"] == otherPreview.Images["web"] {
		t.Fatal("preview fixture versions unexpectedly share an image")
	}
	for _, p := range []struct {
		release  model.Release
		expected string
	}{{firstPreview, "preview-one"}, {otherPreview, "preview-two"}} {
		out, err := deploy.Output(ctx, client, "docker", "run", "--rm", "--entrypoint", "/backend", "--mount", "type=volume,source="+deploy.Project(p.release)+"_state,target=/inspect,readonly", p.release.Images["web"], "read-state")
		if err != nil || strings.TrimSpace(out) != p.expected {
			t.Fatal("preview state isolation failed", out, err)
		}
	}
	_, err = c.Store.Pool.Exec(ctx, "UPDATE resources SET data=jsonb_set(data,'{previewClosed}','true') WHERE id=$1", preview.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = c.cleanupPreview(ctx, preview.ID); err != nil {
		t.Fatal(err)
	}
	if err = c.cleanupPreview(ctx, preview.ID); err != nil {
		t.Fatal("preview cleanup was not idempotent", err)
	}
	if _, err = deploy.Output(ctx, client, "docker", "volume", "inspect", deploy.Project(firstPreview)+"_state"); err == nil {
		t.Fatal("closed preview volume was retained")
	}
	if _, err = deploy.Output(ctx, client, "docker", "volume", "inspect", deploy.Project(otherPreview)+"_state"); err != nil {
		t.Fatal("closing one preview removed another's volume", err)
	}
	t.Log("preview volume/network isolation and repeatable close cleanup passed")
}
