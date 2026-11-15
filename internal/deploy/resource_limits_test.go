package deploy

import (
	"encoding/json"
	"shipyard/internal/model"
	"testing"
)

func TestResourceLimitsOverrideAndPreserveCompose(t *testing.T) {
	var cfg map[string]any
	_ = json.Unmarshal([]byte(`{"services":{"app":{"cpus":4,"cpu_quota":400000,"cpu_period":100000,"mem_limit":1073741824,"environment":{"KEEP":"yes"},"deploy":{"replicas":3,"resources":{"limits":{"cpus":"4","memory":1073741824},"reservations":{"memory":16777216}}}},"db":{"mem_limit":33554432}}}`), &cfg)
	cpu := 0.5
	memory := int64(64 * 1024 * 1024)
	if err := ApplyResourceLimits(cfg, map[string]model.ServiceLimits{"app": {CPUs: &cpu, MemoryBytes: &memory}, "removed": {CPUs: &cpu}}); err != nil {
		t.Fatal(err)
	}
	services := cfg["services"].(map[string]any)
	app := services["app"].(map[string]any)
	if app["cpus"] != cpu || app["mem_limit"] != memory || app["cpu_quota"] != nil || app["environment"] == nil {
		t.Fatal(app)
	}
	deploy := app["deploy"].(map[string]any)
	caps := deploy["resources"].(map[string]any)["limits"].(map[string]any)
	if caps["cpus"] != "0.5" || caps["memory"] != "67108864" || deploy["replicas"] != float64(3) {
		t.Fatal(deploy)
	}
	if services["db"].(map[string]any)["mem_limit"] != float64(33554432) {
		t.Fatal("unconfigured service changed")
	}
}
func TestResourceLimitsRejectReservationAboveCap(t *testing.T) {
	for _, raw := range []string{`{"services":{"app":{"mem_reservation":134217728}}}`, `{"services":{"app":{"deploy":{"resources":{"reservations":{"cpus":"2"}}}}}}`} {
		var cfg map[string]any
		_ = json.Unmarshal([]byte(raw), &cfg)
		cpu := 0.5
		memory := int64(64 * 1024 * 1024)
		if ApplyResourceLimits(cfg, map[string]model.ServiceLimits{"app": {CPUs: &cpu, MemoryBytes: &memory}}) == nil {
			t.Fatal(raw)
		}
	}
}
