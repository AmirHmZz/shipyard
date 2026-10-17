package backup

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/secure"
	"strings"
	"testing"
)

func TestDatabaseBackupRestore(t *testing.T) {
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	for _, tool := range []string{"pg_dump", "pg_restore", "psql"} {
		if _, e := exec.LookPath(tool); e != nil {
			t.Skip("PostgreSQL client tools required")
		}
	}
	ctx := context.Background()
	admin, e := pgxpool.New(ctx, raw)
	if e != nil {
		t.Fatal(e)
	}
	defer admin.Close()
	makeDB := func() string {
		name := "backup_" + strings.ReplaceAll(uuid.NewString(), "-", "")
		if _, e := admin.Exec(ctx, "CREATE DATABASE "+name); e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() {
			pool, _ := pgxpool.New(context.Background(), raw)
			defer pool.Close()
			_, _ = pool.Exec(context.Background(), "DROP DATABASE "+name+" WITH(FORCE)")
		})
		u, _ := url.Parse(raw)
		u.Path = "/" + name
		return u.String()
	}
	source, target := makeDB(), makeDB()
	vault, _ := secure.New(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	store, e := db.Open(ctx, source, vault)
	if e != nil {
		t.Fatal(e)
	}
	defer store.Pool.Close()
	if _, e = store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES('platform-update','{\"state\":\"queued\"}'),('platform-update:old-operation','{}'),('platform-plan:old-plan','{}')"); e != nil {
		t.Fatal(e)
	}
	r, e := store.Save(ctx, "", model.ResourceInput{Kind: "git", Name: "backup credential", Data: json.RawMessage(`{"provider":"gitea"}`), Secrets: map[string]string{"token": "restore-this-secret"}})
	if e != nil {
		t.Fatal(e)
	}
	directory := t.TempDir()
	_ = os.WriteFile(filepath.Join(directory, "artifact"), []byte("durable file"), 0600)
	encrypted, e := ExportWithFiles(ctx, store, source, directory, "strong backup passphrase", map[string][]byte{".env": []byte("encrypted-installation-credentials")})
	if e != nil {
		t.Fatal(e)
	}
	dest := t.TempDir()
	keyFile, e := Restore(ctx, target, dest, "strong backup passphrase", encrypted)
	if e != nil {
		t.Fatal(e)
	}
	key, e := os.ReadFile(keyFile)
	if e != nil {
		t.Fatal(e)
	}
	restoredVault, e := secure.New(string(key))
	if e != nil {
		t.Fatal(e)
	}
	restored, e := db.Open(ctx, target, restoredVault)
	if e != nil {
		t.Fatal(e)
	}
	defer restored.Pool.Close()
	var stale int
	if e = restored.Pool.QueryRow(ctx, "SELECT count(*) FROM settings WHERE key='platform-update' OR key LIKE 'platform-update:%' OR key LIKE 'platform-plan:%'").Scan(&stale); e != nil || stale != 0 {
		t.Fatal("stale update request restored", stale, e)
	}
	if !restored.Maintenance(ctx) {
		t.Fatal("restoration did not force maintenance")
	}
	install, e := os.ReadFile(filepath.Join(dest, "installation", ".env"))
	if e != nil || string(install) != "encrypted-installation-credentials" {
		t.Fatal("installation files not restored", e)
	}
	credential, e := restored.Resource(ctx, r.ID)
	if e != nil {
		t.Fatal(e)
	}
	values, e := restored.Secrets(credential)
	if e != nil || values["token"] != "restore-this-secret" {
		t.Fatal("encrypted credentials were not restored", e)
	}
	file, e := os.ReadFile(filepath.Join(dest, "artifact"))
	if e != nil || string(file) != "durable file" {
		t.Fatal(e)
	}
	if _, e = Restore(ctx, target, t.TempDir(), "strong backup passphrase", encrypted); e == nil {
		t.Fatal("non-empty database overwrite allowed")
	}
}
