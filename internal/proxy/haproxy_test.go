package proxy

import (
	"shipyard/internal/model"
	"strings"
	"testing"
)

func TestProtocolsAndCollision(t *testing.T) {
	bindings := []Binding{{ID: "web", Route: model.Route{Protocol: "https", TLS: "terminate", Domain: "app.example.com", TargetPort: 8080}, Targets: []model.Target{{Address: "127.0.0.1", Port: 18080}}, Certificate: true}, {ID: "grpc", Route: model.Route{Protocol: "grpc", TLS: "terminate", Domain: "grpc.example.com"}, Targets: []model.Target{{Address: "127.0.0.1", Port: 19090}}, Certificate: true}, {ID: "tcp", Route: model.Route{Protocol: "tcp", ListenPort: 15432, TLS: "passthrough"}, Targets: []model.Target{{Address: "127.0.0.1", Port: 25432}}}}
	cfg, e := Render(bindings)
	if e != nil {
		t.Fatal(e)
	}
	for _, want := range []string{"alpn h2,http/1.1", "proto h2", "bind 0.0.0.0:15432", "mode tcp", "timeout tunnel 1h", "check"} {
		if !strings.Contains(cfg, want) {
			t.Error("missing", want)
		}
	}
	bindings = append(bindings, bindings[0])
	if _, e = Render(bindings); e == nil {
		t.Fatal("duplicate route accepted")
	}
	grpc := Binding{ID: "tlsgrpc", Route: model.Route{Protocol: "grpc", TLS: "terminate", Domain: "grpc.example.com"}, Targets: []model.Target{{Address: "127.0.0.1", Port: 19090}}, Certificate: true}
	cfg, e = Render([]Binding{grpc})
	if e != nil {
		t.Fatal(e)
	}
	for _, expected := range []string{"proto h2", "alpn h2"} {
		if !strings.Contains(cfg, expected) {
			t.Fatal("gRPC termination or h2c missing", expected)
		}
	}
}

func TestIPv6ListenersAndWildcardPort(t *testing.T) {
	config, err := Render([]Binding{{ID: "wild", Route: model.Route{Protocol: "https", TLS: "terminate", Domain: "*.example.com"}, Certificate: true, Targets: []model.Target{{Address: "127.0.0.1", Port: 12345}}}, {ID: "tcp6", Route: model.Route{Protocol: "tcp", ListenPort: 15432, TLS: "passthrough"}, Targets: []model.Target{{Address: "127.0.0.1", Port: 23456}}}}, Options{IPv6: true})
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{"bind [::]:80 v6only", "bind [::]:443 v6only ssl", "bind [::]:15432 v6only", "map_reg(/usr/local/etc/haproxy/maps/wildcards.map,unavailable)"} {
		if !strings.Contains(config, expected) {
			t.Fatal("missing IPv6/wildcard behavior", expected)
		}
	}
}

func TestRateLimitRendering(t *testing.T) {
	b := Binding{
		ID: "app",
		Route: model.Route{Protocol: "https", Domain: "app.example.com", TLS: "terminate", RateLimits: []model.RateLimit{
			{Path: "/", Match: "subtree", Requests: 40, WindowSeconds: 30},
			{Path: "/api", Match: "subtree", Requests: 10, WindowSeconds: 5},
			{Path: "/api/login", Match: "exact", Requests: 3, WindowSeconds: 60},
		}},
		Targets: []model.Target{{Address: "127.0.0.1", Port: 8080}},
	}
	cfg, err := Render([]Binding{b})
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"backend b_app\n  mode http\n  balance roundrobin\n  acl rate_path_2 path -m str /api/login",
		"acl rate_path_1 path -m str /api\n  acl rate_path_1 path -m beg /api/",
		"acl rate_path_0 path -m beg /\n",
		"track-sc0 src table rate_app_2 if { var(txn.shipyard_rate_rule) -m int eq 2 }",
		"return status 429 content-type text/plain string Too_Many_Requests if { var(txn.shipyard_rate_rule) -m int eq 2 } { sc_http_req_rate(0) gt 3 }",
		"backend rate_app_2\n  mode http\n  stick-table type ipv6 size 10000 expire 120s store http_req_rate(60s)",
	} {
		if !strings.Contains(cfg, expected) {
			t.Errorf("missing %q", expected)
		}
	}
	if !(strings.Index(cfg, "acl rate_path_2") < strings.Index(cfg, "acl rate_path_1") &&
		strings.Index(cfg, "acl rate_path_1") < strings.Index(cfg, "acl rate_path_0")) {
		t.Fatal("exact paths must precede subtrees, with longer subtrees first")
	}
	b.Route.RateLimits = nil
	cfg, err = Render([]Binding{b})
	if err != nil || strings.Contains(cfg, "stick-table") {
		t.Fatalf("unexpected config without rate limits: %v\n%s", err, cfg)
	}
	b.Route.RateLimits = []model.RateLimit{{Path: "/x\nbackend injected", Match: "exact", Requests: 1, WindowSeconds: 1}}
	if _, err := Render([]Binding{b}); err == nil {
		t.Fatal("renderer accepted an unsafe path")
	}
}
