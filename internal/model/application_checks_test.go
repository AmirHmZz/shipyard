package model

import (
	"encoding/json"
	"testing"
)

func checkRoute(service string, port int) Resource {
	raw, _ := json.Marshal(Route{Service: service, TargetPort: port, Protocol: "https"})
	return Resource{Data: raw}
}
func TestLegacyChecksAndExplicitEmptyRoundTrip(t *testing.T) {
	a := App{Port: 8080, HealthPath: "/ready"}
	routes := []Resource{checkRoute("web", 8080), checkRoute("web", 8080), checkRoute("api", 8080), checkRoute("other", 9000)}
	if checks := a.EffectiveReadiness(routes); len(checks) != 2 || checks[1].Service != "api" {
		t.Fatal(checks)
	}
	a.ReadinessChecks = []HTTPReadinessCheck{}
	raw, _ := json.Marshal(a)
	var restored App
	_ = json.Unmarshal(raw, &restored)
	if checks := restored.EffectiveReadiness(routes); len(checks) != 0 {
		t.Fatal("empty checks restored legacy probing", checks)
	}
	a.PreviewRouting = &PreviewRouting{Mode: "private"}
	if a.EffectivePreviewRouting(routes).Mode != "private" {
		t.Fatal("explicit private preview ignored")
	}
	a.PreviewRouting = nil
	if a.EffectivePreviewRouting(routes).Mode != "inherit" || a.EffectivePreviewRouting(nil).Port != 8080 {
		t.Fatal("legacy preview fallback changed")
	}
}
func TestApplicationCheckValidation(t *testing.T) {
	for _, check := range []HTTPReadinessCheck{{Service: "", Port: 80, Path: "/"}, {Service: "db", Port: 0, Path: "/"}, {Service: "db", Port: 80, Path: "ready"}, {Service: "db", Port: 80, Path: "/\n"}} {
		if ValidateApplicationChecks(App{ReadinessChecks: []HTTPReadinessCheck{check}}) == nil {
			t.Fatal("invalid check accepted", check)
		}
	}
	a := App{ReadinessChecks: []HTTPReadinessCheck{{Service: "private", Port: 8080, Path: "/ready"}}}
	if err := ValidateApplicationChecks(a); err != nil {
		t.Fatal(err)
	}
	if err := a.ValidateReadinessServices(nil, map[string]any{"other": nil}); err == nil {
		t.Fatal("missing service accepted")
	}
	if err := a.ValidateReadinessServices(nil, map[string]any{"private": nil}); err != nil {
		t.Fatal(err)
	}
	a.ReadinessChecks = append(a.ReadinessChecks, a.ReadinessChecks[0])
	if ValidateApplicationChecks(a) == nil {
		t.Fatal("duplicate accepted")
	}
}
