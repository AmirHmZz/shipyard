package platformupdate

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"shipyard/internal/buildinfo"
	"shipyard/internal/db"
	"shipyard/internal/release"
	"shipyard/internal/remote"
	"shipyard/internal/secure"
	"shipyard/internal/testdb"
	"strings"
	"testing"
	"time"
)

func fixture(t *testing.T) (*Service, release.Installation, release.Manifest) {
	t.Helper()
	vault, _ := secure.New(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	store, e := db.Open(context.Background(), testdb.URL(t), vault)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(store.Pool.Close)
	old := buildinfo.Version
	buildinfo.Version = "0.1.0"
	t.Cleanup(func() { buildinfo.Version = old })
	all, e := db.MigrationCatalog()
	if e != nil {
		t.Fatal(e)
	}
	m := release.Manifest{Format: 1, Version: "0.1.0", Schema: db.LatestSchema(), Migrations: all, CoreImage: release.CoreRepository + "@sha256:" + strings.Repeat("a", 64), ExecutorImage: release.ExecutorRepository + "@sha256:" + strings.Repeat("b", 64), Architectures: []string{"amd64", "arm64"}, UpdaterProtocol: 1, PostgresMajor: 18, MinimumDocker: 27, MinimumCompose: "2.24.0", Assets: map[string]string{"install.sh": strings.Repeat("c", 64), "compose.host.yaml": strings.Repeat("d", 64)}}
	i := release.Installation{Format: 1, Revision: 1, Directory: "/opt/shipyard", DaemonID: "engine-test", Project: "shipyard", ControlContainer: "shipyard-shipyard-1", ExecutorContainer: "shipyard-host-executor", Release: m}
	path := filepath.Join(t.TempDir(), "install.json")
	raw, _ := json.Marshal(i)
	if e = os.WriteFile(path, raw, 0600); e != nil {
		t.Fatal(e)
	}
	socket := filepath.Join(t.TempDir(), "docker.sock")
	ln, e := net.Listen("unix", socket)
	if e != nil {
		t.Fatal(e)
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/info" {
			w.Write([]byte(`{"ID":"engine-test"}`))
			return
		}
		http.NotFound(w, r)
	})}
	go server.Serve(ln)
	t.Cleanup(func() { server.Close() })
	s := &Service{Store: store, Local: remote.NewDocker(socket, "executor"), InstallPath: path}
	next := m
	next.Version = "0.1.1"
	next.Previous = m.Version
	next.CoreImage = release.CoreRepository + "@sha256:" + strings.Repeat("e", 64)
	next.ExecutorImage = release.ExecutorRepository + "@sha256:" + strings.Repeat("f", 64)
	raw, _ = json.Marshal([]release.Manifest{next})
	if _, e = store.Pool.Exec(context.Background(), "INSERT INTO settings(key,value) VALUES('release-catalog',$1)", raw); e != nil {
		t.Fatal(e)
	}
	return s, i, next
}
func TestPlansSessionBindingApprovalReplayAndSecrets(t *testing.T) {
	s, _, next := fixture(t)
	ctx := context.Background()
	if _, e := s.Prepare(ctx, "9.9.9", "admin"); e == nil {
		t.Fatal("unknown release accepted")
	}
	p, e := s.Prepare(ctx, next.Version, "admin")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Execute(ctx, p.ID, "other-admin", "long-backup-passphrase", "", false); e == nil {
		t.Fatal("plan stolen")
	}
	if _, e = s.Execute(ctx, p.ID, "admin", "short", "", false); e == nil {
		t.Fatal("weak passphrase")
	}
	p.Destructive = true
	raw, _ := json.Marshal(struct {
		Plan
		ActorID string `json:"actorId"`
	}{p, "admin"})
	s.Store.Pool.Exec(ctx, "UPDATE settings SET value=$2 WHERE key=$1", "platform-plan:"+p.ID, raw)
	if _, e = s.Execute(ctx, p.ID, "admin", "long-backup-passphrase", "", false); e == nil {
		t.Fatal("data loss silently approved")
	}
	o, e := s.Execute(ctx, p.ID, "admin", "long-backup-passphrase", next.Version, true)
	if e != nil {
		t.Fatal(e)
	}
	if len(o.Cipher) != 0 {
		t.Fatal("secret returned")
	}
	saved, e := s.ReadOperation(ctx)
	if e != nil || len(saved.Cipher) == 0 {
		t.Fatal("encrypted secret not persisted", e)
	}
	raw, _ = json.Marshal(saved)
	if strings.Contains(string(raw), "long-backup-passphrase") {
		t.Fatal("plaintext passphrase persisted")
	}
	if _, e = s.Execute(ctx, p.ID, "admin", "long-backup-passphrase", next.Version, true); e == nil {
		t.Fatal("plan replay accepted")
	}
	if _, e = s.Prepare(ctx, next.Version, "admin"); e == nil {
		t.Fatal("concurrent operation accepted")
	}
}
func TestPlanExpiryAndUnsupportedVersionJump(t *testing.T) {
	s, _, next := fixture(t)
	ctx := context.Background()
	next.Previous = "0.0.9"
	raw, _ := json.Marshal([]release.Manifest{next})
	s.Store.Pool.Exec(ctx, "UPDATE settings SET value=$1 WHERE key='release-catalog'", raw)
	if _, e := s.Prepare(ctx, next.Version, "admin"); e == nil {
		t.Fatal("untested version jump accepted")
	}
	next.Previous = "0.1.0"
	raw, _ = json.Marshal([]release.Manifest{next})
	s.Store.Pool.Exec(ctx, "UPDATE settings SET value=$1 WHERE key='release-catalog'", raw)
	p, e := s.Prepare(ctx, next.Version, "admin")
	if e != nil {
		t.Fatal(e)
	}
	p.Expires = time.Now().Add(-time.Minute)
	raw, _ = json.Marshal(struct {
		Plan
		ActorID string `json:"actorId"`
	}{p, "admin"})
	s.Store.Pool.Exec(ctx, "UPDATE settings SET value=$2 WHERE key=$1", "platform-plan:"+p.ID, raw)
	if _, e = s.Execute(ctx, p.ID, "admin", "long-backup-passphrase", "", false); e == nil {
		t.Fatal("expired plan accepted")
	}
}
