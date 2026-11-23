package backup

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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

func TestBackupArchiveLimits(t *testing.T) {
	var archive bytes.Buffer
	gzipWriter := gzip.NewWriter(&archive)
	tarWriter := tar.NewWriter(gzipWriter)
	manifest, err := json.Marshal(Manifest{Version: 1, MasterKey: base64.StdEncoding.EncodeToString(make([]byte, 32))})
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range []struct {
		name string
		data []byte
	}{{"manifest.json", manifest}, {"database.dump", []byte("fixture")}} {
		if err = tarWriter.WriteHeader(&tar.Header{Name: entry.name, Size: int64(len(entry.data)), Mode: 0600}); err != nil {
			t.Fatal(err)
		}
		if _, err = tarWriter.Write(entry.data); err != nil {
			t.Fatal(err)
		}
	}
	if err = errors.Join(tarWriter.Close(), gzipWriter.Close()); err != nil {
		t.Fatal(err)
	}
	const tarLength = 2*1024 + 1024 // Two padded entries and the end marker.
	if _, _, _, err = readArchive(archive.Bytes(), int64(len(manifest)), tarLength); err != nil {
		t.Fatal("exact limits must be accepted", err)
	}
	if _, _, _, err = readArchive(archive.Bytes(), int64(len(manifest))-1, tarLength); !errors.Is(err, errEntryTooLarge) {
		t.Fatal("entry limit was not enforced", err)
	}
	if _, _, _, err = readArchive(archive.Bytes(), int64(len(manifest)), tarLength-1); !errors.Is(err, errArchiveTooLarge) {
		t.Fatal("archive limit did not include tar trailer", err)
	}
	if _, _, _, err = readArchive(archive.Bytes()[:archive.Len()-1], int64(len(manifest)), tarLength); err == nil {
		t.Fatal("truncated gzip trailer was accepted")
	}
	w := &boundedWriter{dst: &bytes.Buffer{}, remaining: 3, limitErr: errEntryTooLarge}
	if _, err = w.Write([]byte("abc")); err != nil {
		t.Fatal(err)
	}
	if _, err = w.Write([]byte("d")); !errors.Is(err, errEntryTooLarge) {
		t.Fatal("entry writer did not stop at the limit", err)
	}
}

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
	project, e := store.Save(ctx, "", model.ResourceInput{Kind: "project", Name: "Logo project", Data: json.RawMessage(`{}`)})
	if e != nil {
		t.Fatal(e)
	}
	if e = store.SaveLogo(ctx, project.ID, "logo-revision", []byte("normalized-png")); e != nil {
		t.Fatal(e)
	}
	if e = store.MoveResource(ctx, project.ID, nil); e != nil {
		t.Fatal(e)
	}
	project, e = store.Resource(ctx, project.ID)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES('test-admin','admin@example.test','Admin','hash',true)"); e != nil {
		t.Fatal(e)
	}
	mcpToken, mcpSecret, e := store.IssueMCPToken(ctx, "test-admin", "Backup exclusion check", []string{project.ID}, 30)
	if e != nil {
		t.Fatal(e)
	}
	if tokenID, err := store.MCPTokenID(ctx, secure.Hash(mcpSecret)); err != nil || tokenID != mcpToken.ID {
		t.Fatalf("original installation did not recognize the token: %v", err)
	}
	directory := t.TempDir()
	_ = os.WriteFile(filepath.Join(directory, "artifact"), []byte("durable file"), 0600)
	encrypted, e := ExportWithFiles(ctx, store, source, directory, "strong backup passphrase", map[string][]byte{".env": []byte("encrypted-installation-credentials")})
	if e != nil {
		t.Fatal(e)
	}
	dest := t.TempDir()
	targetURL, e := url.Parse(target)
	if e != nil {
		t.Fatal(e)
	}
	targetName := pgx.Identifier{strings.TrimPrefix(targetURL.Path, "/")}.Sanitize()
	if _, e = admin.Exec(ctx, "ALTER DATABASE "+targetName+" SET default_transaction_read_only='on'"); e != nil {
		t.Fatal(e)
	}
	if _, e = Restore(ctx, target, dest, "strong backup passphrase", encrypted); e == nil {
		t.Fatal("restore into a read-only database unexpectedly succeeded")
	}
	if _, e = os.Stat(filepath.Join(dest, "artifact")); e != nil {
		t.Fatal("expected staged data before the database failure", e)
	}
	if _, e = admin.Exec(ctx, "ALTER DATABASE "+targetName+" RESET default_transaction_read_only"); e != nil {
		t.Fatal(e)
	}
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
	if tokens, err := restored.MCPTokens(ctx, "test-admin"); err != nil || len(tokens) != 0 {
		t.Fatalf("backup restored MCP credentials: %d, %v", len(tokens), err)
	}
	logoProject, e := restored.Resource(ctx, project.ID)
	if e != nil || logoProject.LogoURL == nil || logoProject.SortOrder != project.SortOrder {
		t.Fatal("logo metadata or ordering not restored", logoProject, e)
	}
	var logo []byte
	if e = restored.Pool.QueryRow(ctx, "SELECT image FROM resource_logos WHERE resource_id=$1", project.ID).Scan(&logo); e != nil || string(logo) != "normalized-png" {
		t.Fatal("logo bytes not restored", e)
	}
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
	if replay, err := Restore(ctx, target, dest, "strong backup passphrase", encrypted); err != nil || replay != keyFile {
		t.Fatal("a committed restore could not be recognized on retry", replay, err)
	}
	if _, e = Restore(ctx, target, t.TempDir(), "strong backup passphrase", encrypted); e == nil {
		t.Fatal("non-empty database overwrite allowed")
	}
}
