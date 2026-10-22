package model

import "testing"

func TestReadinessPolicyCompatibilityAndDisabledChecks(t *testing.T) {
	checks := []HTTPReadinessCheck{{Service: "private", Port: 8080, Path: "/ready"}}
	for _, mode := range []string{"", "checks", "container"} {
		app := App{ReadinessMode: mode, ReadinessChecks: checks}
		if err := ValidateApplicationChecks(app); err != nil {
			t.Fatal(err)
		}
		expected := 1
		if mode == "container" {
			expected = 0
		}
		if len(app.EffectiveReadiness(nil)) != expected {
			t.Fatal("incorrect effective checks", mode)
		}
		err := app.ValidateReadinessServices(nil, map[string]any{})
		if (mode == "container") != (err == nil) {
			t.Fatal("disabled service validation", mode, err)
		}
	}
	if ValidateApplicationChecks(App{ReadinessMode: "invalid"}) == nil {
		t.Fatal("invalid policy accepted")
	}
	legacy := App{Port: 8080, HealthPath: "/health"}
	routes := []Resource{{Data: []byte(`{"service":"app","targetPort":8080}`)}}
	if len(legacy.EffectiveReadiness(routes)) != 1 {
		t.Fatal("legacy HTTP readiness changed")
	}
	legacy.ReadinessMode = "container"
	if len(legacy.EffectiveReadiness(routes)) != 0 {
		t.Fatal("container policy ran legacy checks")
	}
}
