package proxy

import (
	"shipyard/internal/model"
	"strings"
	"testing"
)

func TestDomainMapsExactAndWildcardPrecedence(t *testing.T) {
	bindings := []Binding{{ID: "wild", Route: model.Route{Protocol: "https", TLS: "terminate", Domain: "*.example.com"}, Targets: []model.Target{{Address: "127.0.0.1", Port: 1234}}}, {ID: "specific", Route: model.Route{Protocol: "https", TLS: "terminate", Domain: "*.sub.example.com"}, Targets: []model.Target{{Address: "127.0.0.1", Port: 2345}}}, {ID: "exact", Route: model.Route{Protocol: "grpc", TLS: "terminate", Domain: "API.Example.COM."}, Targets: []model.Target{{Address: "127.0.0.1", Port: 3456}}, Certificate: true}}
	maps, err := RoutingMaps(bindings)
	if err != nil {
		t.Fatal(err)
	}
	if string(maps["hosts.map"]) != "api.example.com b_exact\n" || !strings.HasPrefix(string(maps["wildcards.map"]), "^.+\\.sub\\.example\\.com$ b_specific\n") || string(maps["redirects.map"]) != "b_exact 1\n" {
		t.Fatal(maps)
	}
	config, err := Render(bindings)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(config, "path_beg") || strings.Contains(config, "replace-path") || !strings.Contains(config, "lower,field(1,:),regsub") {
		t.Fatal(config)
	}
}
