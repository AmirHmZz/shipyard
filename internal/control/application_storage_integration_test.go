package control

import (
	"context"
	"encoding/json"
	"os"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"strings"
	"testing"
	"time"
)

func TestLinuxPrivateReadinessAndVolumeInventory(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires isolated SSH/Docker fixture")
	}
	c := testController(t)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
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
	source := `services:
  private:
    image: busybox:1.37.0
    command: ["sh", "-c", "mkdir -p /www /state; printf ready > /www/ready; printf stored-data > /state/marker; exec httpd -f -p 8080 -h /www"]
    deploy:
      replicas: 2
    volumes: [state:/state]
volumes:
  state: {}
`
	spec := model.App{Source: "compose", Engine: "compose", ServerID: server.ID, Context: ".", File: "compose.yaml", HealthTimeout: 15, ReadinessChecks: []model.HTTPReadinessCheck{{Service: "private", Port: 8080, Path: "/ready"}}}
	app := resource(t, c, "application", "", team.ID, spec, map[string]string{"compose": source})
	d, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if err = c.deploy(ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	r, err := c.Store.Active(ctx, app.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Targets) != 0 || len(r.Containers) != 2 || len(r.Networks) != 2 {
		t.Fatal("private readiness changed routing or missed replicas", r.Targets, r.Containers, r.Networks)
	}
	node, _, err := c.connect(ctx, server.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer node.Close()
	volumes, err := c.ApplicationVolumes(ctx, app)
	if err != nil || len(volumes.Errors) != 0 || len(volumes.Volumes) != 1 {
		t.Fatal("volume inventory", volumes, err)
	}
	volume := volumes.Volumes[0]
	if volume.SizeBytes == nil || *volume.SizeBytes <= 0 || !volume.InUse || len(volume.Mounts) != 2 {
		t.Fatal("missing stored data or replicas", volume)
	}
	var logs string
	if err = c.Store.Pool.QueryRow(ctx, "SELECT string_agg(message,E'\n' ORDER BY id) FROM events WHERE deployment_id=$1", d.ID).Scan(&logs); err != nil {
		t.Fatal(err)
	}
	progress := map[string]bool{}
	for _, line := range strings.Split(logs, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Volume "+volume.Name+" ") && (strings.HasSuffix(line, " Creating") || strings.HasSuffix(line, " Created")) {
			if progress[line] {
				t.Fatal("duplicate volume lifecycle event", logs)
			}
			progress[line] = true
		}
	}
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 20*time.Second)
		defer stop()
		client, _, e := c.connect(cleanup, server.ID)
		if e != nil {
			return
		}
		defer client.Close()
		engine := deploy.Engine{Remote: client}
		_ = engine.RemoveProject(cleanup, r)
		_, _ = deploy.Output(cleanup, client, "docker", "volume", "rm", volume.Name)
		_ = c.cleanupIngress(cleanup, app.ID)
	})
	// A missing check service must fail before replacing the healthy containers.
	spec.ReadinessChecks[0].Service = "missing"
	raw, _ := json.Marshal(spec)
	app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Version: app.Version, Data: raw})
	if err != nil {
		t.Fatal(err)
	}
	bad, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if err = c.deploy(ctx, bad.ID); err == nil || !strings.Contains(err.Error(), "missing or disabled service") {
		t.Fatal("invalid service was not rejected during preparation", err)
	}
	for _, id := range r.Containers {
		state, e := deploy.Output(ctx, node, "docker", "inspect", "--format", "{{.State.Status}}", id)
		if e != nil || state != "running" {
			t.Fatal("preflight changed running containers", state, e)
		}
	}
	engine := deploy.Engine{Remote: node}
	if err = engine.Remove(ctx, r, false); err != nil {
		t.Fatal(err)
	}
	volumes, err = c.ApplicationVolumes(ctx, app)
	if err != nil || len(volumes.Volumes) != 1 || volumes.Volumes[0].InUse {
		t.Fatal("unused volume disappeared", volumes, err)
	}
	if _, err = deploy.Output(ctx, node, "docker", "volume", "rm", volume.Name); err != nil {
		t.Fatal(err)
	}
	if _, err = deploy.Output(ctx, node, "docker", "volume", "create", "--label", "com.docker.compose.project="+deploy.Project(r), volume.Name); err != nil {
		t.Fatal(err)
	}
	volumes, err = c.ApplicationVolumes(ctx, app)
	if err != nil || len(volumes.Volumes) != 0 {
		t.Fatal("replacement inherited old ownership", volumes, err)
	}
}
