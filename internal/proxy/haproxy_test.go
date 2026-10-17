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
