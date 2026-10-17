package deploy

import (
	"encoding/json"
	"shipyard/internal/model"
	"testing"
)

func TestPreviewIsolation(t *testing.T) {
	cases := []string{`{"services":{"db":{"ports":[{"target":5432,"published":"5432"}]}}}`, `{"services":{"app":{"volumes":[{"type":"bind","source":"/var/run/docker.sock"}]}}}`, `{"services":{"app":{"container_name":"prod"}}}`, `{"services":{"app":{"privileged":true}}}`, `{"services":{},"volumes":{"db":{"external":true}}}`, `{"services":{},"volumes":{"db":{"name":"production"}}}`}
	for _, raw := range cases {
		var cfg map[string]any
		_ = json.Unmarshal([]byte(raw), &cfg)
		if ValidatePreview(cfg) == nil {
			t.Errorf("unsafe preview accepted: %s", raw)
		}
	}
	var safe map[string]any
	_ = json.Unmarshal([]byte(`{"name":"sy-preview","services":{"app":{"image":"app"}},"volumes":{"db":{"name":"sy-preview_db"}}}`), &safe)
	if e := ValidatePreview(safe); e != nil {
		t.Fatal(e)
	}
}
func TestRuntimeSecretsAreNotPublicReleaseJSON(t *testing.T) {
	r := model.Release{Env: map[string]string{"SECRET": "sensitive"}, BuildSecrets: map[string]string{"TOKEN": "token"}}
	b, _ := json.Marshal(r)
	if string(b) == "" {
		t.Fatal("empty JSON")
	}
	var fields map[string]any
	_ = json.Unmarshal(b, &fields)
	if fields["env"] != nil || fields["buildSecrets"] != nil {
		t.Fatal("release secrets exposed")
	}
}
