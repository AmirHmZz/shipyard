package proxy

import (
	"shipyard/internal/model"
	"strings"
	"testing"
)

func TestDashboardChallengeAndReservedHost(t *testing.T) {
	target := model.Target{Address: "172.24.0.2", Port: 8080}
	bindings := []Binding{{ID: "wild", Route: model.Route{Protocol: "https", TLS: "terminate", Domain: "*.example.com"}, Targets: []model.Target{target}}, {ID: "dashboard", Route: model.Route{Protocol: "https", TLS: "terminate", Domain: "shipyard.example.com"}, Targets: []model.Target{target}, Unavailable: true}}
	maps, e := RoutingMaps(bindings)
	if e != nil || !strings.Contains(string(maps["hosts.map"]), "shipyard.example.com unavailable") {
		t.Fatal(maps, e)
	}
	cfg, e := Render(bindings, Options{Challenge: &Challenge{Domains: []string{"shipyard.example.com"}, Target: target}})
	if e != nil {
		t.Fatal(e)
	}
	if strings.Contains(cfg, "bind 127.0.0.1:8080") || !strings.Contains(cfg, "backend shipyard_acme") || !strings.Contains(cfg, "X-Forwarded-Proto http") || strings.Contains(cfg, "backend b_dashboard") {
		t.Fatal(cfg)
	}
	cfg, e = Render(bindings)
	if e != nil || strings.Contains(cfg, "shipyard_setup") {
		t.Fatal("bootstrap was not removed", e)
	}
	for _, domain := range []string{"*.example.com", "invalid domain", "host:80"} {
		if _, e = Render(bindings, Options{Challenge: &Challenge{Domains: []string{domain}, Target: target}}); e == nil {
			t.Fatal("invalid challenge hostname", domain)
		}
	}
}
