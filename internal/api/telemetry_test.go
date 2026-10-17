package api

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"shipyard/internal/telemetry"
)

func TestPublicTelemetryConfigurationAndCSP(t *testing.T) {
	for _, dsn := range []string{"", telemetry.DefaultDSN} {
		a := &API{Telemetry: telemetry.Config{DSN: dsn, Environment: "testing", Release: "v1"}}
		w := httptest.NewRecorder()
		a.Router().ServeHTTP(w, httptest.NewRequest("GET", "/api/v1/telemetry", nil))
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		var config telemetry.Config
		if err := json.Unmarshal(w.Body.Bytes(), &config); err != nil || config.DSN != dsn {
			t.Fatal(config, err)
		}
		csp := w.Header().Get("Content-Security-Policy")
		if strings.Contains(csp, "https://rustrak.microzap.ir") != (dsn != "") || strings.Contains(csp, "020bd92") {
			t.Fatal("wrong connect policy", csp)
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("runtime settings must not be cached")
		}
	}
}
