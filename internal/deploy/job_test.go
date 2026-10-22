package deploy

import (
	"context"
	"encoding/json"
	"shipyard/internal/model"
	"strings"
	"testing"
)

func TestJobLogReaderBoundsMemoryAndStopsOnlyItsContext(t *testing.T) {
	parent := context.Background()
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	w := jobLogPrefix{cancel: cancel}
	raw := []byte(strings.Repeat("x", 2<<20))
	if n, err := w.Write(raw); err != nil || n != len(raw) {
		t.Fatal(n, err)
	}
	if w.buffer.Len() != 1048577 || !w.full || ctx.Err() == nil || parent.Err() != nil {
		t.Fatal("log limit did not isolate cancellation", w.buffer.Len(), w.full, ctx.Err())
	}
}

func TestJobComposeSelectsOnlyTarget(t *testing.T) {
	var cfg map[string]any
	_ = json.Unmarshal([]byte(`{"services":{"task":{"image":"sha256:fixed","restart":"always","depends_on":{"db":{"condition":"service_healthy"}},"ports":["80:80"],"healthcheck":{"test":["CMD","false"]}},"db":{"image":"never-pull"}},"volumes":{"state":{"name":"sy-app_state"}}}`), &cfg)
	r := model.Release{App: model.App{Engine: "compose", Workload: "job", JobService: "task"}}
	if err := JobCompose(r, cfg); err != nil {
		t.Fatal(err)
	}
	services := cfg["services"].(map[string]any)
	task := services["task"].(map[string]any)
	if len(services) != 1 || task["restart"] != "no" || task["depends_on"] != nil || task["ports"] != nil || task["healthcheck"] != nil {
		t.Fatal(cfg)
	}
	if cfg["volumes"].(map[string]any)["state"].(map[string]any)["name"] != "sy-app_state" {
		t.Fatal("persistent volume name changed")
	}
}
func TestJobComposeRejectsCrossContainerAndReplicas(t *testing.T) {
	for _, raw := range []string{`{"container_name":"shared"}`, `{"volumes_from":["db"]}`, `{"network_mode":"service:db"}`, `{"pid":"service:db"}`, `{"deploy":{"replicas":2}}`, `{"networks":{"default":{"ipv4_address":"172.18.0.2"}}}`} {
		var service map[string]any
		_ = json.Unmarshal([]byte(raw), &service)
		if JobCompose(model.Release{App: model.App{Engine: "dockerfile"}}, map[string]any{"services": map[string]any{"app": service}}) == nil {
			t.Fatal(raw)
		}
	}
}
