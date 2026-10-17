package control

import (
	"context"
	"encoding/json"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"testing"
)

func TestCleanupOnlyNonRootPathRoutes(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	server := resource(t, c, "server", "", "", model.Server{}, nil)
	app := resource(t, c, "application", "", "", model.App{ServerID: server.ID}, nil)
	ids := []string{}
	for _, data := range []map[string]any{{"protocol": "http", "domain": "api.example.com", "path": "/api"}, {"protocol": "http", "domain": "root.example.com", "path": "/"}, {"protocol": "http", "domain": "domain.example.com"}, {"protocol": "tcp", "listenPort": 15432}} {
		ids = append(ids, resource(t, c, "route", app.ID, "", data, nil).ID)
	}
	count, err := c.CleanupPathRoutes(ctx)
	if err != nil || count != 1 {
		t.Fatal(count, err)
	}
	if _, err = c.Store.Resource(ctx, ids[0]); err == nil {
		t.Fatal("path route retained")
	}
	for _, id := range ids[1:] {
		if _, err = c.Store.Resource(ctx, id); err != nil {
			t.Fatal("unrelated route removed", err)
		}
	}
	if count, err = c.CleanupPathRoutes(ctx); count != 0 || err != nil {
		t.Fatal("cleanup not idempotent", count, err)
	}
	for _, data := range []string{`{"path":"/"}`, `{"stripPrefix":false}`} {
		raw := json.RawMessage(data)
		if model.Validate(model.ResourceInput{Kind: "route", Name: "legacy", Data: raw}) == nil {
			t.Fatal("removed fields accepted")
		}
	}
}

func TestPathCleanupPreservesSharedAndUnownedDNS(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	dns := resource(t, c, "dns", "", "", model.DNS{Provider: "cloudflare"}, nil)
	zone := resource(t, c, "zone", dns.ID, "", model.Zone{Domain: "example.com", ProviderZoneID: "zone"}, nil)
	server := resource(t, c, "server", "", "", model.Server{}, nil)
	app := resource(t, c, "application", "", "", model.App{ServerID: server.ID}, nil)
	provider := &fakeDNS{records: []model.DNSRecord{{ID: "shared", Type: "A", Name: "shared.example.com", Content: "192.0.2.1"}, {ID: "external", Type: "A", Name: "external.example.com", Content: "192.0.2.1"}}}
	c.DNSFactory = func(string, string) providers.DNSProvider { return provider }
	for i, entry := range []struct {
		domain, path, record string
		owned                bool
	}{{"shared.example.com", "/api", "shared", true}, {"shared.example.com", "/", "shared", true}, {"external.example.com", "/api", "external", false}} {
		r := resource(t, c, "route", app.ID, "", map[string]any{"protocol": "http", "domain": entry.domain, "path": entry.path, "zoneId": zone.ID}, nil)
		records, _ := json.Marshal([]ownedRecord{{ID: entry.record, Type: "A", Name: entry.domain, Content: "192.0.2.1", Owned: entry.owned}})
		if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO domain_state(route_id,zone_id,domain,records) VALUES($1,$2,$3,$4)", r.ID, zone.ID, entry.domain, records); err != nil {
			t.Fatal(i, err)
		}
	}
	count, err := c.CleanupPathRoutes(ctx)
	if err != nil || count != 2 || len(provider.deleted) != 0 {
		t.Fatal(count, err, provider.deleted)
	}
}
