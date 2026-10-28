package control

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"shipyard/internal/remote"
	"strings"
	"testing"

	"github.com/google/uuid"
	"shipyard/internal/model"
)

func TestStaleComposeSettingsPreservesDeclaredProfileServices(t *testing.T) {
	route := func(id, service string) model.Resource {
		data, _ := json.Marshal(model.Route{Service: service})
		return model.Resource{ID: id, Data: data}
	}
	r := model.Release{App: model.App{
		Networking:     map[string]model.ServiceNetworking{"old": {Hostname: "old"}, "web": {}, "optional": {}},
		PublishedPorts: map[string][]model.PublishedPort{"old": {}, "web": {}},
	}, Routes: []model.Resource{route("stale", "old"), route("valid", "web"), route("profile", "optional")}}
	plan := staleComposeSettings(&r, map[string]any{"web": map[string]any{}, "optional": map[string]any{"profiles": []any{"disabled"}}})
	if !reflect.DeepEqual(plan.Routes, []string{"stale"}) || !reflect.DeepEqual(plan.Networking, []string{"old"}) || !reflect.DeepEqual(plan.Ports, []string{"old"}) {
		t.Fatal(plan)
	}
	if len(r.Routes) != 2 || len(r.App.Networking) != 2 || len(r.App.PublishedPorts) != 1 {
		t.Fatal(r)
	}
	if next := staleComposeSettings(&r, map[string]any{"web": map[string]any{}, "optional": map[string]any{}}); len(next.Routes)+len(next.Networking)+len(next.Ports) != 0 {
		t.Fatal("cleanup is not idempotent", next)
	}
}

func TestComposeCleanupPersistsBeforeBuildAndFencesChanges(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	app := resource(t, c, "application", "", "", model.App{Engine: "compose", Networking: map[string]model.ServiceNetworking{"old": {Hostname: "old"}}}, nil)
	newRelease := func() model.Release {
		spec, _ := model.Decode[model.App](app)
		return model.Release{ID: uuid.NewString(), AppID: app.ID, App: spec}
	}
	r := newRelease()
	log := &deploymentLog{write: func(string) {}}
	cfg := map[string]any{"services": map[string]any{"new": map[string]any{}}}
	if err := c.cleanupComposeServices(ctx, &r, app.Version, cfg, log); err != nil {
		t.Fatal(err)
	}
	saved, _ := c.Store.Resource(ctx, app.ID)
	spec, _ := model.Decode[model.App](saved)
	if len(spec.Networking) != 0 || saved.Version != app.Version+1 {
		t.Fatal("cleanup did not persist before building", saved)
	}
	// Retry the same immutable queued snapshot after an interrupted build.
	retry := newRelease()
	retry.ID = r.ID
	if err := c.cleanupComposeServices(ctx, &retry, app.Version, cfg, log); err != nil {
		t.Fatal("retry failed", err)
	}
	stale := newRelease()
	if err := c.cleanupComposeServices(ctx, &stale, app.Version, cfg, log); err == nil || !strings.Contains(err.Error(), "changed") {
		t.Fatal("stale queue snapshot accepted", err)
	}
	// Cleanup never touches shared networks or lease settings of live containers.
}

func TestComposeCleanupDNSFailureRetainsConfiguration(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	app := resource(t, c, "application", "", "", model.App{Engine: "compose", Networking: map[string]model.ServiceNetworking{"old": {Hostname: "old"}}}, nil)
	zone := resource(t, c, "zone", "", "", map[string]any{}, nil)
	route := resource(t, c, "route", app.ID, "", model.Route{Service: "old", Domain: "old.example.test", ZoneID: zone.ID}, nil)
	_, err := c.Store.Pool.Exec(ctx, "INSERT INTO domain_state(route_id,domain,zone_id) VALUES($1,'old.example.test',$2)", route.ID, zone.ID)
	if err != nil {
		t.Fatal(err)
	}
	spec, _ := model.Decode[model.App](app)
	r := model.Release{ID: uuid.NewString(), AppID: app.ID, App: spec, Routes: []model.Resource{route}}
	err = c.cleanupComposeServices(ctx, &r, app.Version, map[string]any{"services": map[string]any{"new": map[string]any{}}}, &deploymentLog{write: func(string) {}})
	if err == nil {
		t.Fatal("DNS ownership failure was ignored")
	}
	saved, _ := c.Store.Resource(ctx, app.ID)
	if saved.Version != app.Version {
		t.Fatal("partial configuration was committed")
	}
	if _, err = c.Store.Resource(ctx, route.ID); err != nil {
		t.Fatal("domain removed despite cleanup failure", err)
	}
}

func TestComposeCleanupDomainCommitSurvivesProxyFailureAndRecovery(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	host := resource(t, c, "server", "", "", model.Server{}, nil)
	app := resource(t, c, "application", "", "", model.App{Engine: "compose", ServerID: host.ID, Networking: map[string]model.ServiceNetworking{"old": {Hostname: "old"}}}, nil)
	route := resource(t, c, "route", app.ID, "", model.Route{Service: "old", Domain: "old.example.test"}, nil)
	routes := []model.Resource{route}
	for i := 0; i < 40; i++ {
		routes = append(routes, resource(t, c, "route", app.ID, "", model.Route{Service: "old"}, nil))
	}
	shared := resource(t, c, "network", host.ID, "", model.Network{ServerID: host.ID, Managed: true}, nil)
	leaseKey := "network-lease:" + shared.ID + ":172.20.0.10"
	if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2)", leaseKey, json.RawMessage(`{"application":"`+app.ID+`","service":"old","release":"active"}`)); err != nil {
		t.Fatal(err)
	}
	c.DialNode = func(context.Context, model.Server, map[string]string) (remote.Node, error) {
		return nil, errors.New("proxy unavailable")
	}
	makeRelease := func(id string) model.Release {
		spec, _ := model.Decode[model.App](app)
		return model.Release{ID: id, AppID: app.ID, ServerID: host.ID, App: spec, Routes: routes}
	}
	id := uuid.NewString()
	r := makeRelease(id)
	cfg := map[string]any{"services": map[string]any{"new": map[string]any{}}}
	err := c.cleanupComposeServices(ctx, &r, app.Version, cfg, &deploymentLog{write: func(string) {}})
	if err == nil || !strings.Contains(err.Error(), "proxy unavailable") {
		t.Fatal(err)
	}
	if _, err = c.Store.Resource(ctx, route.ID); err == nil {
		t.Fatal("deleted domain was restored")
	}
	var proxyPending bool
	if err = c.Store.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM jobs WHERE kind='proxy' AND resource_id=$1 AND dedupe=$2 AND state='queued')", host.ID, "compose-cleanup-proxy:"+id).Scan(&proxyPending); err != nil || !proxyPending {
		t.Fatal("failed proxy reload lost its durable retry", err)
	}
	if _, err = c.Store.Resource(ctx, shared.ID); err != nil {
		t.Fatal("shared network removed", err)
	}
	var leaseExists bool
	if err = c.Store.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM settings WHERE key=$1)", leaseKey).Scan(&leaseExists); err != nil || !leaseExists {
		t.Fatal("live address released", err)
	}
	retry := makeRelease(id)
	if err = c.cleanupComposeServices(ctx, &retry, app.Version, cfg, &deploymentLog{write: func(string) {}}); err == nil || !strings.Contains(err.Error(), "proxy unavailable") {
		t.Fatal("retry failed before proxy reconciliation", err)
	}
	recovery := makeRelease(uuid.NewString())
	if err = c.filterDeletedRoutes(ctx, &recovery); err != nil {
		t.Fatal(err)
	}
	if len(recovery.Routes) != 0 || len(recovery.App.Networking) != 0 {
		t.Fatal("recovery resurrected removed settings")
	}
}
