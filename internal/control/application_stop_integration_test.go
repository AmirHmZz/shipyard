package control

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

func TestLinuxStopRestartingApplicationWithoutActiveRelease(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires isolated SSH/Docker fixture")
	}
	c, _, app := actionsFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	host := os.Getenv("SHIPYARD_FIXTURE_HOST")
	var dial func() (remote.Node, error)
	if helper := os.Getenv("SHIPYARD_LOCAL_TEST_HELPER"); helper != "" {
		dial = func() (remote.Node, error) { return remote.NewDocker("/var/run/docker.sock", helper), nil }
	} else {
		key, err := os.ReadFile(os.Getenv("SHIPYARD_FIXTURE_PRIVATE_KEY_FILE"))
		if err != nil {
			t.Fatal(err)
		}
		fingerprint, err := remote.Fingerprint(ctx, host, 2222)
		if err != nil {
			t.Fatal(err)
		}
		dial = func() (remote.Node, error) {
			return remote.Dial(ctx, model.Server{Host: host, Port: 2222, User: "root", Fingerprint: fingerprint}, string(key), "")
		}
	}
	node, err := dial()
	if err != nil {
		t.Fatal(err)
	}
	defer node.Close()
	c.DialNode = func(context.Context, model.Server, map[string]string) (remote.Node, error) { return dial() }
	run := func(args ...string) string {
		t.Helper()
		out, e := deploy.Output(ctx, node, args...)
		if e != nil {
			t.Fatal(e)
		}
		return out
	}
	name := "stop-loop-" + uuid.NewString()
	volume := name + "-data"
	run("docker", "volume", "create", volume)
	crash := run("docker", "run", "-d", "--name", name, "--restart", "unless-stopped", "--label", "shipyard.app="+app.ID, "--label", "shipyard.release=failed", "--label", "com.docker.compose.project=sy-"+app.ID, "--label", "com.docker.compose.service=clickhouse", "--label", "com.docker.compose.container-number=1", "-v", volume+":/data", "busybox:1.37.0", "sh", "-c", "echo invalid ClickHouse configuration >&2; echo retained > /data/marker; sleep 0.2; exit 78")
	other := run("docker", "run", "-d", "--name", name+"-unrelated", "busybox:1.37.0", "sleep", "120")
	defer func() {
		cleanup, stop := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer stop()
		_, _ = deploy.Output(cleanup, node, "docker", "rm", "-f", crash, other)
		_, _ = deploy.Output(cleanup, node, "docker", "volume", "rm", volume)
	}()
	deadline := time.Now().Add(10 * time.Second)
	for run("docker", "inspect", "--format", "{{.RestartCount}}", crash) == "0" {
		if time.Now().After(deadline) {
			t.Fatal("fixture never restarted")
		}
		time.Sleep(100 * time.Millisecond)
	}
	var logs strings.Builder
	engine := deploy.Engine{Remote: node, Log: &logs}
	release := model.Release{ID: "failed", AppID: app.ID, App: model.App{Engine: "compose"}}
	engine.Diagnostics(ctx, release)
	if !strings.Contains(logs.String(), "invalid ClickHouse configuration") || !strings.Contains(logs.String(), "restarts=") {
		t.Fatal(logs.String())
	}
	if _, err = c.Store.Active(ctx, app.ID); err == nil {
		t.Fatal("fixture unexpectedly has an active release")
	}
	spec, _ := model.Decode[model.App](app)
	if err = c.stopApplicationServer(ctx, app.ID, spec.ServerID, map[string]bool{"sy-" + app.ID: true}); err != nil {
		t.Fatal(err)
	}
	restarts := run("docker", "inspect", "--format", "{{.RestartCount}}", crash)
	time.Sleep(3 * time.Second)
	if state := run("docker", "inspect", "--format", "{{.State.Running}} {{.State.Restarting}} {{.HostConfig.RestartPolicy.Name}}", crash); state != "false false unless-stopped" {
		t.Fatal("Stop did not hold", state)
	}
	if run("docker", "inspect", "--format", "{{.RestartCount}}", crash) != restarts {
		t.Fatal("container kept restarting")
	}
	if run("docker", "inspect", "--format", "{{.State.Running}}", other) != "true" {
		t.Fatal("unrelated container was stopped")
	}
	if run("docker", "run", "--rm", "-v", volume+":/data:ro", "busybox:1.37.0", "cat", "/data/marker") != "retained" {
		t.Fatal("application data lost")
	}
	run("docker", "start", crash)
	time.Sleep(time.Second)
	if run("docker", "inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", crash) != "unless-stopped" {
		t.Fatal("resume lost restart policy")
	}
}

func TestLinuxStopCancelsReadinessAndRetainsStartupLogs(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires isolated SSH/Docker fixture")
	}
	c := testController(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
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
	if _, err = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", server.ID, team.ID); err != nil {
		t.Fatal(err)
	}
	source := "services:\n  clickhouse:\n    image: busybox:1.37.0\n    command: [sh, -c, 'echo invalid configuration $$SECRET >&2; exec sleep 600']\n    restart: unless-stopped\n    healthcheck:\n      test: [CMD, 'false']\n      interval: 1s\n"
	app := resource(t, c, "application", "", team.ID, model.App{Source: "compose", Engine: "compose", ServerID: server.ID, Context: ".", File: "compose.yaml", HealthTimeout: 120}, map[string]string{"compose": source, "env:SECRET": "startup-secret-token"})
	d, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanup, stop := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer stop()
		r, e := c.Store.Release(cleanup, d.ID)
		if e == nil {
			node, _, e := c.connect(cleanup, server.ID)
			if e == nil {
				defer node.Close()
				engine := deploy.Engine{Remote: node}
				_ = engine.RemoveProject(cleanup, r)
			}
		}
	}()
	finished := make(chan error, 1)
	go func() { finished <- c.deploy(ctx, d.ID) }()
	deadline := time.Now().Add(time.Minute)
	for {
		current, e := c.Store.Deployment(ctx, d.ID)
		if e != nil {
			t.Fatal(e)
		}
		events, e := c.Store.Events(ctx, d.ID, 0)
		if e != nil {
			t.Fatal(e)
		}
		live := false
		for _, event := range events {
			if strings.Contains(event.Message, "invalid configuration [REDACTED]") {
				live = true
			}
			if strings.Contains(event.Message, "startup-secret-token") {
				t.Fatal("startup secret leaked")
			}
		}
		if current.Phase == "readiness" && live {
			break
		}
		select {
		case e := <-finished:
			t.Fatal("deployment finished before Stop", e)
		default:
		}
		if time.Now().After(deadline) {
			t.Fatal("startup logs were not visible during readiness")
		}
		time.Sleep(100 * time.Millisecond)
	}
	if err = c.Action(ctx, app, "stop"); err != nil {
		t.Fatal(err)
	}
	select {
	case err = <-finished:
		if !errors.Is(err, ErrApplicationStopped) {
			t.Fatal(err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Stop did not interrupt readiness")
	}
	if d, err = c.Store.Deployment(ctx, d.ID); err != nil || d.State != "cancelled" {
		t.Fatal(d, err)
	}
	worker := uuid.NewString()
	job, err := c.Store.Claim(ctx, worker, "application-stop")
	if err != nil {
		t.Fatal(err)
	}
	c.runJob(ctx, job, worker)
	runtime, err := c.Runtime(ctx, app.ID)
	if err != nil || runtime["status"] != "stopped" {
		t.Fatal(runtime, err)
	}
	if _, err = c.queue(ctx, app, "", "", "git:later"); !errors.Is(err, ErrAutoDeployPaused) {
		t.Fatal("Git push restarted app", err)
	}
	if _, err = c.Queue(ctx, app, "", ""); err != nil {
		t.Fatal("explicit deploy failed to resume", err)
	}
	events, err := c.Store.Events(ctx, d.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, event := range events {
		if strings.Contains(event.Message, "invalid configuration [REDACTED]") {
			found = true
		}
	}
	if !found {
		t.Fatal("startup logs not retained after cancellation")
	}
}
