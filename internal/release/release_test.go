package release

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"shipyard/internal/db"
	"strings"
	"testing"
)

func testManifest(t *testing.T) Manifest {
	t.Helper()
	all, e := db.MigrationCatalog()
	if e != nil {
		t.Fatal(e)
	}
	return Manifest{Format: 1, Version: "0.1.0", CoreImage: CoreRepository + "@sha256:" + strings.Repeat("a", 64), ExecutorImage: ExecutorRepository + "@sha256:" + strings.Repeat("b", 64), Architectures: []string{"amd64", "arm64"}, Schema: len(all), Migrations: all, UpdaterProtocol: 1, PostgresMajor: 18, MinimumDocker: 27, MinimumCompose: "2.24.0", Assets: map[string]string{"install.sh": strings.Repeat("c", 64), "compose.host.yaml": strings.Repeat("d", 64)}}
}
func TestCatalogDraftFilteringAndIntegrity(t *testing.T) {
	m := testManifest(t)
	b, _ := json.Marshal(m)
	tamper := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/releases?") || r.URL.Path == "/releases":
			w.Write([]byte(`[{"tag_name":"v0.1.0","draft":false,"prerelease":false,"body":"Notes"},{"tag_name":"v0.2.0","draft":true},{"tag_name":"v0.2.0-beta.1","prerelease":true}]`))
		case strings.HasSuffix(r.URL.Path, "release.json"):
			if tamper {
				w.Write(append(b, ' '))
			} else {
				w.Write(b)
			}
		case strings.HasSuffix(r.URL.Path, "SHA256SUMS"):
			w.Write([]byte(Hash(b) + "  release.json\n"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	c := Catalog{API: server.URL, Downloads: server.URL}
	items, e := c.List(context.Background())
	if e != nil || len(items) != 1 || items[0].Notes != "Notes" {
		t.Fatal(items, e)
	}
	tamper = true
	if _, e = c.Fetch(context.Background(), "0.1.0"); e == nil {
		t.Fatal("damaged manifest accepted")
	}
	for _, version := range []string{"latest", "../../main", "v0.1.0", "0.1.0-beta.1"} {
		if _, e = c.Fetch(context.Background(), version); e == nil {
			t.Fatal("invalid version", version)
		}
	}
}
func TestRejectUntrustedImagesAndMissingMigrationMetadata(t *testing.T) {
	m := testManifest(t)
	if e := m.Validate(); e != nil {
		t.Fatal(e)
	}
	m.CoreImage = "attacker/image@sha256:" + strings.Repeat("a", 64)
	if m.Validate() == nil {
		t.Fatal("untrusted registry accepted")
	}
	m = testManifest(t)
	m.ExecutorImage = ExecutorRepository + ":latest"
	if m.Validate() == nil {
		t.Fatal("mutable image accepted")
	}
	m = testManifest(t)
	m.Migrations = nil
	if m.Validate() == nil {
		t.Fatal("incomplete history accepted")
	}
}
