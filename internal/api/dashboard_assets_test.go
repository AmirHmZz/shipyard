package api

import (
	"io/fs"
	"net/http/httptest"
	"strings"
	"testing"

	webassets "shipyard/internal/web"
)

func TestDashboardSPAAssetFallback(t *testing.T) {
	assets, err := fs.Sub(webassets.Assets, "dist")
	if err != nil {
		t.Fatal(err)
	}
	index, err := fs.ReadFile(assets, "index.html")
	if err != nil {
		t.Fatal(err)
	}
	router := (&API{}).Router()
	for _, path := range []string{
		"/", "/projects/example", "/applications/example?tab=networking",
		"/dns/example/records/record", "/configure/application/new", "/unknown/path",
	} {
		t.Run(path, func(t *testing.T) {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
			if response.Code != 200 || response.Body.String() != string(index) {
				t.Fatalf("dashboard route %q returned %d with unexpected content", path, response.Code)
			}
			if !strings.HasPrefix(response.Header().Get("Content-Type"), "text/html") {
				t.Fatalf("dashboard route %q did not return HTML", path)
			}
			for _, hash := range strings.Fields(dashboardScriptHashes()) {
				if !strings.Contains(response.Header().Get("Content-Security-Policy"), hash) {
					t.Fatalf("dashboard route %q CSP omitted bootstrap script hash", path)
				}
			}
		})
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/api/v1/nonexistent", nil))
	if response.Code != 404 || response.Body.String() == string(index) {
		t.Fatal("unknown API endpoint served dashboard HTML")
	}
}
