package control

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"testing"
)

func TestDeletionTreeFreezesChildrenAndRemovesHistory(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	project := resource(t, c, "project", team.ID, team.ID, map[string]any{}, nil)
	env := resource(t, c, "environment", project.ID, team.ID, map[string]any{}, nil)
	host := resource(t, c, "server", "", "", model.Server{}, nil)
	app := resource(t, c, "application", env.ID, team.ID, model.App{ServerID: host.ID}, nil)
	preview := resource(t, c, "application", env.ID, team.ID, model.App{ServerID: host.ID, PreviewOf: app.ID}, nil)
	other := resource(t, c, "project", team.ID, team.ID, map[string]any{}, nil)
	otherEnv := resource(t, c, "environment", other.ID, team.ID, map[string]any{}, nil)
	id, err := c.QueueDeletion(ctx, project, "actor")
	if err != nil {
		t.Fatal(err)
	}
	again, err := c.QueueDeletion(ctx, project, "actor")
	if err != nil || again != id {
		t.Fatal("deletion not idempotent", err)
	}
	for _, r := range []model.Resource{project, env, app, preview} {
		current, err := c.Store.Resource(ctx, r.ID)
		if err != nil || !model.IsDeleting(current) {
			t.Fatal("unfrozen descendant", current, err)
		}
	}
	for _, in := range []model.ResourceInput{
		{Kind: "environment", Name: "late", ParentID: project.ID, TeamID: team.ID, Data: json.RawMessage(`{}`)},
		{Kind: "application", Name: "late preview", ParentID: otherEnv.ID, TeamID: team.ID, Data: json.RawMessage(`{"previewOf":"` + app.ID + `"}`)},
	} {
		if _, err = c.Store.Save(ctx, "", in); !errors.Is(err, db.ErrDeleting) {
			t.Fatal("concurrent child creation allowed", err)
		}
	}
	if _, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: app.Version}); !errors.Is(err, db.ErrDeleting) {
		t.Fatal("deletion flags could be cleared", err)
	}
	if err = c.deleteTree(ctx, model.Job{ID: id, ResourceID: project.ID}); err != nil {
		t.Fatal(err)
	}
	for _, r := range []model.Resource{project, env, app, preview} {
		if _, err = c.Store.Resource(ctx, r.ID); !errors.Is(err, pgx.ErrNoRows) {
			t.Fatal("descendant retained", r.ID, err)
		}
	}
	for _, r := range []model.Resource{team, host, other, otherEnv} {
		if _, err = c.Store.Resource(ctx, r.ID); err != nil {
			t.Fatal("unrelated resource removed", err)
		}
	}
	if err = c.deleteTree(ctx, model.Job{ID: id, ResourceID: project.ID}); err != nil {
		t.Fatal("retry after commit", err)
	}
}

func TestDeletionDNSFailureIsRetriableAndPreservesSharedRecords(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	host := resource(t, c, "server", "", "", model.Server{}, nil)
	dns := resource(t, c, "dns", "", "", model.DNS{Provider: "cloudflare"}, map[string]string{"token": "test"})
	zone := resource(t, c, "zone", dns.ID, "", model.Zone{Domain: "example.com", ProviderZoneID: "zone"}, nil)
	app := resource(t, c, "application", "", "", model.App{ServerID: host.ID}, nil)
	route := resource(t, c, "route", app.ID, "", model.Route{Protocol: "https", Domain: "app.example.com", ZoneID: zone.ID}, nil)
	records := []ownedRecord{{ID: "owned", Name: "app.example.com", Content: "192.0.2.10", Owned: true}, {ID: "shared", Name: "shared.example.com", Content: "192.0.2.10", Owned: false}}
	raw, _ := json.Marshal(records)
	if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO domain_state(route_id,zone_id,domain,records) VALUES($1,$2,'app.example.com',$3)", route.ID, zone.ID, raw); err != nil {
		t.Fatal(err)
	}
	provider := &fakeDNS{records: []model.DNSRecord{{ID: "owned", Name: "app.example.com", Content: "changed"}, {ID: "shared", Name: "shared.example.com", Content: "192.0.2.10"}}}
	c.DNSFactory = func(string, string) providers.DNSProvider { return provider }
	id, err := c.QueueDeletion(ctx, app, "actor")
	if err != nil {
		t.Fatal(err)
	}
	if err = c.deleteTree(ctx, model.Job{ID: id, ResourceID: app.ID}); err == nil {
		t.Fatal("externally changed owned record erased")
	}
	current, _ := c.Store.Resource(ctx, app.ID)
	var state struct {
		Error string `json:"deletionError"`
	}
	_ = json.Unmarshal(current.Data, &state)
	if state.Error == "" || !model.IsDeleting(current) {
		t.Fatal("failed cleanup lost state")
	}
	provider.records[0].Content = "192.0.2.10"
	_, _ = c.Store.Pool.Exec(ctx, "UPDATE jobs SET state='failed' WHERE id=$1", id)
	_, _ = c.Store.Pool.Exec(ctx, "UPDATE jobs SET created_at=now()-interval '31 days' WHERE id=$1", id)
	if err = c.Store.Retention(ctx); err != nil {
		t.Fatal(err)
	}
	retried, err := c.QueueDeletion(ctx, current, "actor")
	if err != nil || retried != id {
		t.Fatal(err)
	}
	if err = c.deleteTree(ctx, model.Job{ID: id, ResourceID: app.ID}); err != nil {
		t.Fatal(err)
	}
	if len(provider.deleted) != 1 || provider.deleted[0] != "owned" {
		t.Fatal("unowned DNS record removed", provider.deleted)
	}
}

func TestDeletionRejectsOverlappingTrees(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	project := resource(t, c, "project", "", "", map[string]any{}, nil)
	env := resource(t, c, "environment", project.ID, "", map[string]any{}, nil)
	app := resource(t, c, "application", env.ID, "", model.App{}, nil)
	if _, err := c.QueueDeletion(ctx, app, "actor"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.QueueDeletion(ctx, project, "actor"); err == nil {
		t.Fatal("overlapping cleanup queued")
	}
	current, _ := c.Store.Resource(ctx, project.ID)
	if model.IsDeleting(current) {
		t.Fatal("rejected project was frozen")
	}
}

func TestDeletionResumesAfterWorkerLeaseExpires(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	app := resource(t, c, "application", "", "", model.App{}, nil)
	id, err := c.QueueDeletion(ctx, app, "actor")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = c.Store.Claim(ctx, "interrupted-worker", "resource-delete"); err != nil {
		t.Fatal(err)
	}
	// Simulate a process dying after claiming the job. The next controller must
	// recover from persisted flags and the cleanup manifest without new input.
	if _, err = c.Store.Pool.Exec(ctx, "UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1", id); err != nil {
		t.Fatal(err)
	}
	job, err := c.Store.Claim(ctx, "replacement-worker", "resource-delete")
	if err != nil || job.ID != id || job.Attempts != 2 {
		t.Fatal("expired cleanup not reclaimed", job, err)
	}
	restarted := &Controller{Store: c.Store, DataDir: c.DataDir, Logger: c.Logger}
	restarted.runJob(ctx, job, "replacement-worker")
	if _, err = c.Store.Resource(ctx, app.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("resumed cleanup did not remove app", err)
	}
	var state string
	if err = c.Store.Pool.QueryRow(ctx, "SELECT state FROM jobs WHERE id=$1", id).Scan(&state); err != nil || state != "done" {
		t.Fatal("cleanup not acknowledged", state, err)
	}
}
