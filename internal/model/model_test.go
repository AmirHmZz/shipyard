package model

import (
	"encoding/json"
	"testing"
)

func TestDomainAndRepositoryBoundaries(t *testing.T) {
	for _, s := range []string{"a\nhttp-request deny.example.com", "localhost", "127.0.0.1", "-bad.example.com", "a b.example.com"} {
		if _, e := Domain(s); e == nil {
			t.Errorf("accepted %q", s)
		}
	}
	if s, e := Domain("*.EXAMPLE.com."); e != nil || s != "*.example.com" {
		t.Fatal(s, e)
	}
	for _, s := range []string{"../secret", "a/../../secret", "/etc/passwd", `C:\secret`, "a\x00b"} {
		if Relative(s) {
			t.Errorf("accepted path %q", s)
		}
	}
	if !Relative(".") || !Relative("apps/web/Dockerfile") {
		t.Fatal("valid relative path rejected")
	}
}
func TestTCPPortsAndBackendValidation(t *testing.T) {
	r := Route{Protocol: "tcp", Domain: "db.example.com", ZoneID: "zone", TargetPort: 5432, ListenPort: 443, TLS: "terminate"}
	check := func() error {
		b, _ := json.Marshal(r)
		return Validate(ResourceInput{Kind: "route", Name: "test", Data: b})
	}
	if check() == nil {
		t.Fatal("port 443 accepted for TCP")
	}
	r.ListenPort = 5432
	if e := check(); e != nil {
		t.Fatal(e)
	}
	r.TLS = "off"
	if check() == nil {
		t.Fatal("plaintext TCP accepted")
	}
}

func TestServerAuthenticationMethod(t *testing.T) {
	for _, method := range []string{"", "private_key", "password", "agent"} {
		b, _ := json.Marshal(Server{Host: "server.test", Port: 22, User: "root", Fingerprint: "SHA256:verified", AuthMethod: method})
		err := Validate(ResourceInput{Kind: "server", Name: "server", Data: b})
		if (err != nil) != (method == "agent") {
			t.Errorf("method %q: %v", method, err)
		}
	}
}

func TestRouteNeedsOnlyDomainIdentity(t *testing.T) {
	raw := json.RawMessage(`{"protocol":"https","domain":"api.example.com","service":"app","targetPort":8080,"tls":"terminate","zoneId":"zone"}`)
	if err := Validate(ResourceInput{Kind: "route", Data: raw}); err != nil {
		t.Fatal(err)
	}
	if err := Validate(ResourceInput{Kind: "team", Data: json.RawMessage(`{}`)}); err == nil {
		t.Fatal("other resource names became optional")
	}
}
