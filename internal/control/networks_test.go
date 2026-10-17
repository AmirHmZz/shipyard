package control

import (
	"context"
	"encoding/json"
	"net/netip"
	"shipyard/internal/model"
	"strings"
	"testing"
)

func TestNetworkReservationsAndConflictBoundaries(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	r := resource(t, c, "network", "", "", model.Network{}, nil)
	s := model.Network{Subnet: "172.30.0.0/24", DynamicRange: "172.30.0.128/25", Gateway: "172.30.0.1", IPv6Subnet: "fd12:3456::/64", IPv6DynamicRange: "fd12:3456:0:0:8000::/65", IPv6Gateway: "fd12:3456::1"}
	first := model.Release{ID: "release1", AppID: "app1"}
	ip, e := c.reserveIP(ctx, r, s, first, "web", 1, "", false, DockerNetwork{})
	if e != nil || ip != "172.30.0.2" {
		t.Fatal(ip, e)
	}
	same, e := c.reserveIP(ctx, r, s, first, "web", 1, "", false, DockerNetwork{})
	if e != nil || same != ip {
		t.Fatal("not idempotent", same, e)
	}
	other := model.Release{ID: "release2", AppID: "app2"}
	for _, bad := range []string{ip, "172.30.0.1", "172.30.0.130", "192.0.2.2", "172.30.0.255"} {
		if _, e = c.reserveIP(ctx, r, s, other, "web", 1, bad, false, DockerNetwork{}); e == nil {
			t.Fatal("invalid reservation accepted", bad)
		}
	}
	ip6, e := c.reserveIP(ctx, r, s, first, "web", 1, "", true, DockerNetwork{})
	if e != nil || !strings.HasPrefix(ip6, "fd12:3456::") {
		t.Fatal(ip6, e)
	}
	if err := c.ReleaseNetworkLeases(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	if ip, e = c.reserveIP(ctx, r, s, other, "web", 1, "172.30.0.2", false, DockerNetwork{}); e != nil {
		t.Fatal(ip, e)
	}
	for _, raw := range []string{"172.30.0.0/24", "fd12:3456::/64"} {
		p := netip.MustParsePrefix(raw)
		upper := upperHalf(p)
		if !p.Contains(upper.Addr()) || upper.Contains(p.Addr().Next()) {
			t.Fatal("invalid dynamic range", upper)
		}
	}
}
func TestPreviewDisableAndWildcardOwnership(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	dns := resource(t, c, "dns", "", "", model.DNS{}, nil)
	zone := resource(t, c, "zone", dns.ID, "", model.Zone{Domain: "example.com"}, nil)
	app := resource(t, c, "application", "", "", model.App{Previews: true, PreviewDomain: "*.preview.example.com", PreviewZoneID: zone.ID}, nil)
	p := resource(t, c, "application", "", "", model.App{PreviewOf: app.ID}, nil)
	if e := c.ValidatePreviewDomain(ctx, "other", "", model.App{PreviewDomain: "*.preview.example.com", PreviewZoneID: zone.ID}); e == nil {
		t.Fatal("duplicate wildcard accepted")
	}
	if e := c.ValidatePreviewDomain(ctx, "other", "", model.App{PreviewDomain: "*.outside.com", PreviewZoneID: zone.ID}); e == nil {
		t.Fatal("unrelated wildcard accepted")
	}
	if e := c.DisablePreviews(ctx, app.ID); e != nil {
		t.Fatal(e)
	}
	current, _ := c.Store.Resource(ctx, p.ID)
	var state model.App
	_ = json.Unmarshal(current.Data, &state)
	if !state.PreviewClosed {
		t.Fatal("preview left enabled")
	}
	var count int
	_ = c.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE kind='preview-cleanup' AND resource_id=$1", p.ID).Scan(&count)
	if count != 1 {
		t.Fatal("cleanup not queued")
	}
}
