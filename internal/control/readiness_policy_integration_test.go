package control

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

func TestLinuxContainerPolicyDoesNotReserveDisabledReadinessIngress(t *testing.T) {
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
  worker:
    image: busybox:1.37.0
    command: [sleep, "300"]
    deploy:
      replicas: 2
    healthcheck:
      test: [CMD, "false"]
      interval: 1s
      retries: 1
`
	spec := model.App{Source: "compose", Engine: "compose", ServerID: server.ID, Context: ".", File: "compose.yaml", HealthTimeout: 15, ReadinessMode: "container", ReadinessChecks: []model.HTTPReadinessCheck{{Service: "missing-disabled-service", Port: 8080, Path: "/ready"}}}
	app := resource(t, c, "application", "", team.ID, spec, map[string]string{"compose": source})
	d, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 20*time.Second)
		defer stop()
		node, _, err := c.connect(cleanup, server.ID)
		if err == nil {
			defer node.Close()
			_ = (&deploy.Engine{Remote: node}).RemoveProject(cleanup, model.Release{AppID: app.ID})
		}
	})
	if err = c.deploy(ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	r, err := c.Store.Active(ctx, app.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Containers) != 2 || len(r.Networks) != 0 || len(r.Targets) != 0 || r.App.ReadinessMode != "container" || r.App.HealthTimeout != 15 || len(r.App.ReadinessChecks) != 1 {
		t.Fatalf("incorrect container-only release: %+v", r)
	}
	// Selecting checks explicitly re-enables service validation before replacement.
	spec.ReadinessMode = "checks"
	raw, _ := json.Marshal(spec)
	app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Version: app.Version, Data: raw})
	if err != nil {
		t.Fatal(err)
	}
	d, err = c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if err = c.deploy(ctx, d.ID); err == nil {
		t.Fatal("enabled missing HTTP service passed validation")
	}
	active, err := c.Store.Active(ctx, app.ID)
	if err != nil || active.ID != r.ID {
		t.Fatal("failed checked policy replaced the active release", err)
	}
}
