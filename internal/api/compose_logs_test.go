package api

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRuntimeLogsPreserveValuesAcrossWrites(t *testing.T) {
	recorder := httptest.NewRecorder()
	writer := &logWriter{w: recorder}
	_, _ = writer.Write([]byte("inline-sensitive-"))
	_, _ = writer.Write([]byte("value\nfirst-secret-line\nsecond-secret-line\nnormal log\n"))
	got := recorder.Body.String()
	for _, secret := range []string{"inline-sensitive-value", "first-secret-line", "second-secret-line"} {
		if !strings.Contains(got, secret) {
			t.Fatal("runtime log value was removed", got)
		}
	}
	if strings.Contains(got, "[redacted]") || !strings.Contains(got, "normal log") {
		t.Fatal(got)
	}
}
