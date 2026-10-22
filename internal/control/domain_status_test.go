package control

import (
	"context"
	"strings"
	"testing"

	"shipyard/internal/model"
)

func TestRouteStatusInitializationAndEarlyFailure(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	zone := resource(t, c, "zone", "", "", model.Zone{Domain: "example.com"}, nil)
	app := resource(t, c, "application", "", "", model.App{ServerID: "missing-server"}, nil)
	route := resource(t, c, "route", app.ID, "", model.Route{Domain: "app.example.com", ZoneID: zone.ID, TLS: "terminate"}, nil)
	before, err := c.RouteStatus(ctx, route)
	if err != nil || before.DNS != "pending" || before.Propagation != "pending" || before.Certificate != "pending" || before.Records == nil {
		t.Fatal("incorrect initial state", before, err)
	}
	if err = c.domain(ctx, route.ID, ""); err == nil {
		t.Fatal("missing deployment server accepted")
	}
	state, err := c.DomainState(ctx, route.ID)
	if err != nil || state.Error == "" || state.DNS == "unmanaged" {
		t.Fatal("early failure was lost", state, err)
	}
}

func TestRouteStatusExposesLatestFailedJobBeforeInitialization(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	route := resource(t, c, "route", "", "", model.Route{Domain: "app.example.com", ZoneID: "missing-zone", TLS: "terminate"}, nil)
	if err := c.Store.Enqueue(ctx, "domain", route.ID, "status-test", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Store.Pool.Exec(ctx, "UPDATE jobs SET state='failed',attempts=6,last_error='zone missing' WHERE resource_id=$1", route.ID); err != nil {
		t.Fatal(err)
	}
	state, err := c.RouteStatus(ctx, route)
	if err != nil || state.Sync == nil || state.Sync.State != "failed" || state.DNS != "failed" || !strings.Contains(state.Error, "zone missing") {
		t.Fatal(state, err)
	}
	if _, err = c.Store.Pool.Exec(ctx, "UPDATE jobs SET state='running',last_error='' WHERE resource_id=$1", route.ID); err != nil {
		t.Fatal(err)
	}
	state, err = c.RouteStatus(ctx, route)
	if err != nil || state.Sync == nil || state.Sync.State != "running" || state.Error != "" || state.DNS != "pending" {
		t.Fatal(state, err)
	}
}
