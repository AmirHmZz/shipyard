package proxy

import (
	"reflect"
	"strings"
	"testing"

	"shipyard/internal/model"
)

func TestHTTPSProbesFollowWebBindings(t *testing.T) {
	for _, test := range []struct {
		bindings Bindings
		want     []string
	}{
		{nil, []string{"127.0.0.1:443"}},
		{Bindings{"web": {"::"}}, []string{"[::1]:443"}},
		{Bindings{"web": {"192.0.2.10", "2001:db8::10"}}, []string{"192.0.2.10:443", "[2001:db8::10]:443"}},
		{Bindings{"web": {"127.0.0.2"}, "tcp-route": {"192.0.2.20"}}, []string{"127.0.0.2:443"}},
	} {
		if got := HTTPSProbeAddresses(test.bindings); !reflect.DeepEqual(got, test.want) {
			t.Fatalf("probe addresses %v, want %v", got, test.want)
		}
	}
}

func TestIndependentFrontendBindings(t *testing.T) {
	bindings := []Binding{
		{ID: "web-route", Route: model.Route{Protocol: "https", TLS: "terminate", Domain: "app.example.com"}, Certificate: true, Targets: []model.Target{{Address: "127.0.0.1", Port: 18080}}},
		{ID: "tcp-route", FrontendID: "route-uuid", Route: model.Route{Protocol: "tcp", ListenPort: 15432, TLS: "passthrough"}, Targets: []model.Target{{Address: "127.0.0.1", Port: 25432}}},
	}
	config, err := Render(bindings, Options{IPv6: true, Bindings: Bindings{"web": {"127.0.0.1"}, "route-uuid": {"::1", "192.0.2.10"}}})
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{"bind 127.0.0.1:80", "bind 127.0.0.1:443 ssl", "bind [::1]:15432 v6only", "bind 192.0.2.10:15432", "server s0 127.0.0.1:18080 check", "server s0 127.0.0.1:25432 check"} {
		if !strings.Contains(config, expected) {
			t.Errorf("missing %s", expected)
		}
	}
	for _, unexpected := range []string{"bind 0.0.0.0", "bind [::]:", "bind [::1]:80", "bind 127.0.0.1:15432"} {
		if strings.Contains(config, unexpected) {
			t.Errorf("binding leaked to another frontend: %s", unexpected)
		}
	}
	config, err = Render(bindings, Options{Bindings: Bindings{"web": {"::1"}}})
	if err != nil || !strings.Contains(config, "bind [::1]:80 v6only") || !strings.Contains(config, "bind 0.0.0.0:15432") || strings.Contains(config, "bind 0.0.0.0:80") {
		t.Fatal("IPv6-only override or TCP defaults lost", err, config)
	}
}

func TestBindAddressBoundaries(t *testing.T) {
	for _, value := range []string{"", "example.com", "127.0.0.1:80", "[::1]", "192.0.2.0/24", "::1/128", "*", "unix@/tmp/socket", "fe80::1%eth0", "127.0.0.1\n  mode tcp", "1.2.3.999"} {
		if _, err := NormalizeBindings(Bindings{"web": {value}}); err == nil {
			t.Errorf("accepted %q", value)
		}
	}
	if _, err := NormalizeBindings(Bindings{"web": {}}); err == nil {
		t.Fatal("empty custom address list accepted")
	}
	if _, err := NormalizeBindings(Bindings{"web": {"::1", "0:0:0:0:0:0:0:1"}}); err == nil {
		t.Fatal("duplicate normalized addresses accepted")
	}
	for _, value := range []string{"0.0.0.0", "::", "127.0.0.1", "192.168.1.2", "2001:db8::1"} {
		if _, err := NormalizeBindings(Bindings{"web": {value}}); err != nil {
			t.Errorf("valid %s: %v", value, err)
		}
	}
	if values, err := NormalizeBindings(Bindings{"web": {" 2001:0db8::1 "}}); err != nil || values["web"][0] != "2001:db8::1" {
		t.Fatal(values, err)
	}
}
