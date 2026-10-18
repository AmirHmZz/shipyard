package control

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

func TestLinuxFreshDeployInterruptedVolume(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires isolated SSH/Docker fixture")
	}
	c, _, app := actionsFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
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
	node, err := remote.Dial(ctx, model.Server{Host: host, Port: 2222, User: "root", Fingerprint: fingerprint}, string(key), "")
	if err != nil {
		t.Fatal(err)
	}
	defer node.Close()
	run := func(args ...string) string {
		t.Helper()
		out, e := deploy.Output(ctx, node, args...)
		if e != nil {
			t.Fatal(e)
		}
		return out
	}
	name := "fresh-retry-" + uuid.NewString()
	defer deploy.Output(context.Background(), node, "docker", "volume", "rm", name)
	run("docker", "volume", "create", "--label", "com.docker.compose.project=sy-"+app.ID, name)
	volumes, err := inspectDeletionObjects[deletionVolume](ctx, node, "volume")
	if err != nil {
		t.Fatal(err)
	}
	var original deletionVolume
	for _, v := range volumes {
		if v.Name == name {
			original = v
		}
	}
	d, err := c.QueueFresh(ctx, app, "")
	if err != nil {
		t.Fatal(err)
	}
	m := &freshDeployment{Application: app.ID, Daemon: run("docker", "info", "--format", "{{.ID}}"), Volumes: []deletionVolume{original}, Started: true, Completed: map[string]bool{}, Removing: map[string]bool{name: true}}
	if err = c.saveFreshDeployment(ctx, d.ID, m); err != nil {
		t.Fatal(err)
	}
	// The delete succeeded, but the worker died before recording completion.
	// A new volume now reuses that exact Docker name.
	run("docker", "volume", "rm", name)
	run("docker", "volume", "create", "--label", "com.docker.compose.project=sy-"+app.ID, name)
	run("docker", "run", "--rm", "-v", name+":/data", "busybox:1.37.0", "sh", "-c", "echo replacement >/data/marker")
	restarted := &Controller{Store: c.Store}
	var started bool
	err = restarted.resetFreshDeployment(ctx, node, model.Release{ID: d.ID, AppID: app.ID}, &started)
	if err == nil || !strings.Contains(err.Error(), "interrupted") || !started {
		t.Fatal("ambiguous reset resumed", err)
	}
	if got := run("docker", "run", "--rm", "-v", name+":/data", "busybox:1.37.0", "cat", "/data/marker"); got != "replacement" {
		t.Fatal("replacement data erased", got)
	}
}

func TestLinuxFreshDeployAndDeploymentDeletion(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires isolated SSH/Docker fixture")
	}
	c := testController(t)
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
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
	node, _, err := c.connect(ctx, server.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer node.Close()
	run := func(args ...string) string {
		t.Helper()
		out, e := deploy.Output(ctx, node, args...)
		if e != nil {
			t.Fatal(args, e)
		}
		return out
	}
	suffix := uuid.NewString()
	external := "fresh-external-" + suffix
	bind := "/tmp/fresh-bind-" + suffix
	consumer := "fresh-consumer-" + suffix
	run("docker", "volume", "create", external)
	run("mkdir", "-p", bind)
	source := `services:
  web:
    image: busybox:1.37.0
    command: [sh, -c, 'sleep 3600']
    volumes:
      - state:/state
      - shared:/shared
      - external:/external
      - /anonymous
      - ` + bind + `:/bind
volumes:
  state: {}
  shared: {}
  external:
    name: ` + external + `
    external: true
`
	app := resource(t, c, "application", "", team.ID, model.App{Source: "compose", Engine: "compose", ServerID: server.ID, HealthTimeout: 2}, map[string]string{"compose": source})
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), time.Minute)
		defer stop()
		node, _, e := c.connect(cleanup, server.ID)
		if e != nil {
			t.Error(e)
			return
		}
		defer node.Close()
		_, _ = deploy.Output(cleanup, node, "sh", "-c", "docker ps -aq --filter "+remote.Quote("label=shipyard.app="+app.ID)+" | xargs -r docker rm -f; docker rm -f "+remote.Quote(consumer)+" 2>/dev/null || true; docker volume ls -q --filter "+remote.Quote("label=com.docker.compose.project=sy-"+app.ID)+" | xargs -r docker volume rm")
		_, _ = deploy.Output(cleanup, node, "docker", "volume", "rm", external)
		_, _ = deploy.Output(cleanup, node, "rm", "-rf", "--", bind)
	})
	deployApp := func(fresh bool) model.Deployment {
		t.Helper()
		var d model.Deployment
		var e error
		if fresh {
			d, e = c.QueueFresh(ctx, app, "")
		} else {
			d, e = c.Queue(ctx, app, "", "")
		}
		if e != nil {
			t.Fatal(e)
		}
		if e = c.deploy(ctx, d.ID); e != nil {
			var log string
			_ = c.Store.Pool.QueryRow(ctx, "SELECT string_agg(message,E'\n' ORDER BY id) FROM events WHERE deployment_id=$1", d.ID).Scan(&log)
			t.Fatal(e, log)
		}
		d, e = c.Store.Deployment(ctx, d.ID)
		if e != nil || d.State != "healthy" {
			t.Fatal(d, e)
		}
		return d
	}
	first := deployApp(false)
	active, err := c.Store.Active(ctx, app.ID)
	if err != nil || len(active.Containers) != 1 {
		t.Fatal(active, err)
	}
	run("docker", "exec", active.Containers[0], "sh", "-c", "echo saved >/state/marker; echo shared >/shared/marker; echo external >/external/marker; echo bind >/bind/marker; echo anonymous >/anonymous/marker")
	run("docker", "run", "-d", "--name", consumer, "-v", "sy-"+app.ID+"_shared:/data", "busybox:1.37.0", "sleep", "3600")
	second := deployApp(false)
	active, err = c.Store.Active(ctx, app.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got := run("docker", "exec", active.Containers[0], "cat", "/state/marker"); got != "saved" {
		t.Fatal("ordinary deployment erased state", got)
	}
	if _, err = c.QueueDeploymentDeletion(ctx, first.ID, "operator"); err != nil {
		t.Fatal(err)
	}
	if err = c.deleteDeployment(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	if got := run("docker", "exec", active.Containers[0], "cat", "/state/marker"); got != "saved" {
		t.Fatal("history deletion affected active runtime", got)
	}
	if _, err = c.QueueDeploymentDeletion(ctx, second.ID, "operator"); err == nil {
		t.Fatal("active release deletable")
	}
	fresh := deployApp(true)
	active, err = c.Store.Active(ctx, app.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got := run("docker", "exec", active.Containers[0], "sh", "-c", "test ! -e /state/marker && test ! -e /anonymous/marker && cat /external/marker /shared/marker /bind/marker"); got != "external\nshared\nbind" {
		t.Fatal("Fresh deploy did not preserve protected data", got)
	}
	// A stopped or failed fresh attempt must not silently restore old images.
	run("docker", "exec", active.Containers[0], "sh", "-c", "echo erase >/state/marker")
	app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: app.Version, Secrets: map[string]string{"compose": strings.Replace(source, "sleep 3600", "exit 1", 1)}})
	if err != nil {
		t.Fatal(err)
	}
	failed, err := c.QueueFresh(ctx, app, "")
	if err != nil {
		t.Fatal(err)
	}
	if err = c.deploy(ctx, failed.ID); err == nil {
		t.Fatal("unhealthy Fresh deploy succeeded")
	}
	status, err := c.Runtime(ctx, app.ID)
	if err != nil || status["status"] != "stopped" || status["releaseId"] != fresh.ID {
		t.Fatal("failed Fresh deploy auto-recovered", status, err)
	}
	if got := run("docker", "ps", "-aq", "--filter", "label=shipyard.app="+app.ID); got != "" {
		t.Fatal("partial containers left running", got)
	}
	if got := run("docker", "run", "--rm", "-v", "sy-"+app.ID+"_state:/data", "busybox:1.37.0", "sh", "-c", "test ! -e /data/marker && echo empty"); got != "empty" {
		t.Fatal("old data restored", got)
	}
	if got := run("docker", "exec", consumer, "cat", "/data/marker"); got != "shared" {
		t.Fatal("unrelated consumer affected", got)
	}
	// Explicit rollback remains possible, with the new empty application data.
	rollback, err := c.Queue(ctx, app, "", fresh.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = c.deploy(ctx, rollback.ID); err != nil {
		t.Fatal("explicit rollback failed", err)
	}
}
