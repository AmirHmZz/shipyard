package api

import (
	"net/http/httptest"
	"shipyard/internal/model"
	"strings"
	"testing"
)

func TestDirectComposeRuntimeLogRedaction(t *testing.T) {
	// Retained releases contain rendered JSON, including resolved env_file values.
	compose := `{"services":{"web":{"image":"nginx","environment":{"TOKEN":"inline-sensitive-value"}}},"secrets":{"key":{"content":"first-secret-line\nsecond-secret-line"}}}`
	recorder := httptest.NewRecorder()
	writer := &logWriter{w: recorder, secrets: model.ComposeRedactions(compose)}
	_, _ = writer.Write([]byte("inline-sensitive-"))
	_, _ = writer.Write([]byte("value\nfirst-secret-line\nsecond-secret-line\nnormal log\n"))
	got := recorder.Body.String()
	for _, secret := range []string{"inline-sensitive-value", "first-secret-line", "second-secret-line"} {
		if strings.Contains(got, secret) {
			t.Fatal("Compose runtime secret exposed", got)
		}
	}
	if !strings.Contains(got, "[redacted]") || !strings.Contains(got, "normal log") {
		t.Fatal(got)
	}
}
