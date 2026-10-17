package control

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"shipyard/internal/model"
	"shipyard/internal/proxy"
)

func TestProxySettingsCommitFailureRetryAndCleanup(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	server := resource(t, c, "server", "", "", model.Server{IPv6: "2001:db8::1"}, nil)
	other := resource(t, c, "server", "", "", model.Server{}, nil)
	app := resource(t, c, "application", "", "", model.App{ServerID: server.ID}, nil)
	route := resource(t, c, "route", app.ID, "", model.Route{Protocol: "tcp", ListenPort: 15432}, nil)
	foreignApp := resource(t, c, "application", "", "", model.App{ServerID: other.ID}, nil)
	foreign := resource(t, c, "route", foreignApp.ID, "", model.Route{Protocol: "tcp", ListenPort: 15433}, nil)
	state, err := c.ProxyState(ctx, server.ID)
	if err != nil || len(state.Frontends) != 2 || len(state.Frontends[0].Addresses) != 2 {
		t.Fatal("default frontend metadata", state, err)
	}
	for _, bindings := range []proxy.Bindings{{foreign.ID: {"127.0.0.1"}}, {"web": {}}, {"web": {"localhost"}}} {
		if _, err := c.QueueProxySettings(ctx, server.ID, "admin", ProxySettingsInput{Bindings: bindings}); !errors.Is(err, ErrInvalidProxyBindings) {
			t.Fatal("invalid binding queued", err)
		}
	}
	input := ProxySettingsInput{Bindings: proxy.Bindings{"web": {"127.0.0.1"}, route.ID: {"::1"}}}
	id, err := c.QueueProxySettings(ctx, server.ID, "admin", input)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = c.QueueProxySettings(ctx, server.ID, "admin", input); !errors.Is(err, ErrProxyConflict) {
		t.Fatal("parallel apply not rejected", err)
	}
	var job model.Job
	job.ID = id
	job.ResourceID = server.ID
	if err = c.Store.Pool.QueryRow(ctx, "SELECT payload FROM jobs WHERE id=$1", id).Scan(&job.Payload); err != nil {
		t.Fatal(err)
	}
	failed := errors.New("address cannot be bound")
	if err = c.applyProxySettingsWith(ctx, job, func(context.Context, proxy.Bindings) error { return failed }); !errors.Is(err, failed) {
		t.Fatal(err)
	}
	state, _ = c.ProxyState(ctx, server.ID)
	if state.Version != 0 || len(state.Bindings) != 0 {
		t.Fatal("failed apply committed settings", state)
	}
	calls := 0
	apply := func(_ context.Context, bindings proxy.Bindings) error {
		calls++
		if bindings[route.ID][0] != "::1" || bindings["web"][0] != "127.0.0.1" {
			t.Fatal(bindings)
		}
		return nil
	}
	if err = c.applyProxySettingsWith(ctx, job, apply); err != nil {
		t.Fatal(err)
	}
	if err = c.applyProxySettingsWith(ctx, job, apply); err != nil || calls != 1 {
		t.Fatal("interrupted finish re-applied committed settings", calls, err)
	}
	state, err = c.ProxyState(ctx, server.ID)
	if err != nil || state.Version != 1 || state.LastJobID != id || state.AppliedAt == nil || state.Frontends[0].UseDefaults {
		t.Fatal(state, err)
	}
	if _, err = c.QueueProxySettings(ctx, server.ID, "admin", input); !errors.Is(err, ErrProxyConflict) {
		t.Fatal("stale revision accepted", err)
	}
	_, _ = c.Store.Pool.Exec(ctx, "UPDATE jobs SET state='done' WHERE id=$1", id)
	_, _ = c.Store.Pool.Exec(ctx, "UPDATE resources SET data='{}'::jsonb WHERE id=$1", route.ID)
	if err = c.PruneProxySettings(ctx, server.ID); err != nil {
		t.Fatal(err)
	}
	state, _ = c.ProxyState(ctx, server.ID)
	if _, exists := state.Bindings[route.ID]; exists || state.Version != 2 || state.Bindings["web"][0] != "127.0.0.1" {
		t.Fatal("obsolete override retained", state)
	}
	resetID, err := c.QueueProxySettings(ctx, server.ID, "admin", ProxySettingsInput{Version: state.Version, Bindings: proxy.Bindings{}})
	if err != nil {
		t.Fatal(err)
	}
	job.ID = resetID
	job.Payload, _ = json.Marshal(proxySettingsJob{ProxySettingsInput: ProxySettingsInput{Version: state.Version, Bindings: proxy.Bindings{}}})
	if err = c.applyProxySettingsWith(ctx, job, func(_ context.Context, b proxy.Bindings) error {
		if len(b) != 0 {
			t.Fatal(b)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	state, _ = c.ProxyState(ctx, server.ID)
	if !state.Frontends[0].UseDefaults || len(state.Frontends[0].Addresses) != 2 {
		t.Fatal("defaults not restored", state)
	}
}
