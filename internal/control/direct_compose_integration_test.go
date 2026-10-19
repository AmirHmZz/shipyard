package control

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/remote"
	"strings"
	"testing"
	"time"
)

func TestLinuxDirectComposeDeployAndRollback(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires isolated SSH/Docker fixture")
	}
	c := testController(t)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()
	host := os.Getenv("SHIPYARD_FIXTURE_HOST")
	key, err := os.ReadFile(os.Getenv("SHIPYARD_FIXTURE_PRIVATE_KEY_FILE"))
	if err != nil {
		t.Fatal(err)
	}
	fingerprint, err := remote.Fingerprint(ctx, host, 2222)
	if err != nil {
		t.Fatal(err)
	}
	server := resource(t, c, "server", "", "", model.Server{Host: host, Port: 2222, User: "root", Fingerprint: fingerprint}, map[string]string{"private_key": string(key)})
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	_, err = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", server.ID, team.ID)
	if err != nil {
		t.Fatal(err)
	}
	c.GitFactory = func(model.Git, map[string]string) providers.GitProvider {
		t.Fatal("Direct Compose tried to fetch Git")
		return nil
	}
	// Compose emits an obsolete-version warning on stderr before its JSON output.
	// That diagnostic must never contaminate the configuration we decode.
	source := `version: "3.8"
services:
  web:
    image: busybox:1.37.0
    user: "0"
    entrypoint: ["/bin/sh", "-c"]
    command:
      - 'mkdir -p /www /state; test -f /state/marker || printf "%s" "$$VERSION" > /state/marker; printf "%s/%s" "$$VERSION" "$$(cat /state/marker)" > /www/index.html; exec /bin/busybox httpd -f -p 8080 -h /www'
    environment:
      VERSION: first
    volumes: [state:/state]
volumes:
  state: {}
`
	spec := model.App{Source: "compose", Engine: "compose", ServerID: server.ID, Context: ".", File: "compose.yaml", HealthTimeout: 15}
	app := resource(t, c, "application", "", team.ID, spec, map[string]string{"compose": source})
	route := resource(t, c, "route", app.ID, team.ID, model.Route{Protocol: "https", Domain: "raw.example.com", Service: "web", TargetPort: 8080, TLS: "terminate"}, nil)
	run := func(rollback string) model.Deployment {
		t.Helper()
		d, err := c.Queue(ctx, app, "", rollback)
		if err != nil {
			t.Fatal(err)
		}
		if err = c.deploy(ctx, d.ID); err != nil {
			var detail string
			_ = c.Store.Pool.QueryRow(ctx, "SELECT string_agg(message,E'\n' ORDER BY id) FROM events WHERE deployment_id=$1", d.ID).Scan(&detail)
			t.Fatal(err, detail)
		}
		d, err = c.Store.Deployment(ctx, d.ID)
		if err != nil || d.State != "healthy" {
			t.Fatal(d, err)
		}
		return d
	}
	cert, pool := certificate(t)
	encrypted, _ := c.Store.Vault.Seal(cert, "certificate:"+route.ID)
	if _, err = c.Store.Pool.Exec(ctx, "INSERT INTO domain_state(route_id,domain,certificate,expires_at,dns_state,certificate_state) VALUES($1,'raw.example.com',$2,now()+interval '1 hour','ready','ready')", route.ID, encrypted); err != nil {
		t.Fatal(err)
	}
	first := run("")
	client := &http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool, ServerName: "raw.example.com", MinVersion: tls.VersionTLS12}}}
	lastStatus := 0
	get := func() string {
		t.Helper()
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://"+net.JoinHostPort(host, "443")+"/", nil)
		req.Host = "raw.example.com"
		res, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		lastStatus = res.StatusCode
		body, _ := io.ReadAll(res.Body)
		return string(body)
	}
	if got := get(); got != "first/first" {
		t.Fatal("initial image-only deployment", got)
	}
	source = strings.Replace(source, "VERSION: first", "VERSION: second", 1)
	app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: app.Version, Secrets: map[string]string{"compose": source}})
	if err != nil {
		t.Fatal(err)
	}
	queued, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	// Later edits cannot mutate an already queued source snapshot.
	app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: app.Version, Secrets: map[string]string{"compose": strings.Replace(source, "VERSION: second", "VERSION: future", 1)}})
	if err != nil {
		t.Fatal(err)
	}
	if err = c.deploy(ctx, queued.ID); err != nil {
		t.Fatal(err)
	}
	if got := get(); got != "second/first" {
		t.Fatal("mutable queue source or lost volume", got)
	}
	run(first.ReleaseID)
	if got := get(); got != "first/first" {
		t.Fatal("rollback changed source or volume", got)
	}
	firstRelease, err := c.Store.Release(ctx, first.ReleaseID)
	if err != nil {
		t.Fatal(err)
	}
	active, err := c.Store.Active(ctx, app.ID)
	if err != nil || active.Images["web"] != firstRelease.Images["web"] {
		t.Fatal("rollback did not restore exact image", err)
	}
	inline := func(version string) string {
		return fmt.Sprintf(`services:
  web:
    build:
      context: .
      dockerfile_inline: |
        FROM busybox:1.37.0
        USER 0
        RUN mkdir -p /www && printf '%s' > /www/index.html
        ENTRYPOINT ["/bin/busybox", "httpd", "-f", "-p", "8080", "-h", "/www"]
    volumes: [state:/state]
volumes:
  state: {}
`, version)
	}
	app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: app.Version, Secrets: map[string]string{"compose": inline("inline-one")}})
	if err != nil {
		t.Fatal(err)
	}
	inlineFirst := run("")
	if got := get(); got != "inline-one" {
		t.Fatal(got)
	}
	app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: app.Version, Secrets: map[string]string{"compose": inline("inline-two")}})
	if err != nil {
		t.Fatal(err)
	}
	run("")
	if got := get(); got != "inline-two" {
		t.Fatal(got)
	}
	run(inlineFirst.ReleaseID)
	if got := get(); got != "inline-one" {
		t.Fatal("inline image rollback rebuilt the source", got)
	}
	retained, _ := c.Store.Active(ctx, app.ID)
	if retained.Images["web"] == firstRelease.Images["web"] {
		t.Fatal("inline build did not create an independent image")
	}
	bad := "services:\n  web:\n    image: busybox:1.37.0\n    entrypoint: [/bin/sh, -c]\n    command: 'exit 1'\n"
	app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: app.Version, Secrets: map[string]string{"compose": bad}})
	if err != nil {
		t.Fatal(err)
	}
	d, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if err = c.deploy(ctx, d.ID); err == nil {
		t.Fatal("failed container accepted")
	}
	failed, _ := c.Store.Deployment(ctx, d.ID)
	if failed.State != "failed" {
		t.Fatal("automatic recovery failed", failed)
	}
	if got := get(); got != "inline-one" {
		t.Fatal("failed health gate lost previous release", got)
	}
	ssh, _, err := c.connect(ctx, server.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer ssh.Close()
	active, _ = c.Store.Active(ctx, app.ID)
	out, err := deploy.Output(ctx, ssh, "docker", "volume", "inspect", deploy.Project(active)+"_state")
	if err != nil || !json.Valid([]byte(out)) {
		t.Fatal("named volume lost", err)
	}
	// Invalid Compose schemas pass the lightweight YAML check but must expose
	// Docker's stderr diagnostic, with variables removed from all error surfaces.
	invalid := "services:\n  web:\n    image: busybox:1.37.0\n    ports: ['${PRIVATE_BAD_PORT}:8080']\n"
	app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: app.Version, Secrets: map[string]string{"compose": invalid, "env:PRIVATE_BAD_PORT": "private-invalid-port"}})
	if err != nil {
		t.Fatal(err)
	}
	d, err = c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	err = c.deploy(ctx, d.ID)
	if err == nil || !strings.Contains(err.Error(), "render Compose configuration") || !strings.Contains(err.Error(), "private-invalid-port") {
		t.Fatal("missing or filtered worker error", err)
	}
	var events string
	_ = c.Store.Pool.QueryRow(ctx, "SELECT string_agg(message,E'\n' ORDER BY id) FROM events WHERE deployment_id=$1", d.ID).Scan(&events)
	if !strings.Contains(events, "Deployment failed: render Compose configuration") || !strings.Contains(events, "private-invalid-port") {
		t.Fatal("missing or filtered log diagnostic", events)
	}
	failed, _ = c.Store.Deployment(ctx, d.ID)
	if failed.Error == "" || !strings.Contains(failed.Error, "private-invalid-port") {
		t.Fatal("missing or filtered status", failed)
	}
	if got := get(); got != "inline-one" {
		t.Fatal("configuration validation changed the running release", got)
	}
	// Deletion must work even with the now-invalid saved document, remove every
	// retained/failed generation, and leave persisted data and other apps alone.
	unrelated := "unrelated-" + app.ID
	if _, err = deploy.Output(ctx, ssh, "docker", "run", "-d", "--name", unrelated, "--label", "com.docker.compose.project="+unrelated, "busybox:1.37.0", "sleep", "600"); err != nil {
		t.Fatal(err)
	}
	defer deploy.Output(context.Background(), ssh, "docker", "rm", "-f", unrelated)
	jobID, err := c.QueueDeletion(ctx, app, "integration")
	if err != nil {
		t.Fatal(err)
	}
	job := model.Job{ID: jobID, ResourceID: app.ID}
	if err = c.deleteTree(ctx, job); err != nil {
		t.Fatal(err)
	}
	if err = c.deleteTree(ctx, job); err != nil {
		t.Fatal("retry after deletion", err)
	}
	if _, err = c.Store.Resource(ctx, app.ID); err == nil {
		t.Fatal("application still exists")
	}
	var count int
	if err = c.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM deployments WHERE app_id=$1", app.ID).Scan(&count); err != nil || count != 0 {
		t.Fatal("deployment history retained", count, err)
	}
	out, err = deploy.Output(ctx, ssh, "docker", "ps", "-aq", "--filter", "label=com.docker.compose.project="+deploy.Project(active))
	if err != nil || strings.TrimSpace(out) != "" {
		t.Fatal("deleted containers retained", out, err)
	}
	out, err = deploy.Output(ctx, ssh, "docker", "run", "--rm", "-v", deploy.Project(active)+"_state:/state:ro", "busybox:1.37.0", "cat", "/state/marker")
	if err != nil || strings.TrimSpace(out) != "first" {
		t.Fatal("persistent data lost", out, err)
	}
	out, err = deploy.Output(ctx, ssh, "docker", "inspect", "--format", "{{.State.Running}}", unrelated)
	if err != nil || strings.TrimSpace(out) != "true" {
		t.Fatal("unrelated application removed", out, err)
	}
	if _, err = deploy.Output(ctx, ssh, "test", "!", "-e", remote.Root+"/releases/"+d.ID); err != nil {
		t.Fatal("failed build source retained", err)
	}
	req, _ := http.NewRequestWithContext(ctx, "GET", "http://"+net.JoinHostPort(host, "80")+"/", nil)
	req.Host = "raw.example.com"
	response, requestErr := http.DefaultClient.Do(req)
	if requestErr != nil {
		t.Fatal(requestErr)
	}
	body, _ := io.ReadAll(response.Body)
	response.Body.Close()
	lastStatus = response.StatusCode
	if lastStatus != http.StatusServiceUnavailable || string(body) != "No_healthy_application" {
		t.Fatal("deleted hostname is still routed", lastStatus, body)
	}
	t.Log("Direct Compose without Git: immutable queued YAML, image-only and inline builds, exact-image rollback, health recovery and volume preservation passed")
	t.Log("Application deletion: all history and failed workspaces removed, HAProxy reconciled, persistent data and unrelated workloads preserved; retry is idempotent")
}
