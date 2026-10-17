package backup

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"shipyard/internal/buildinfo"
	"shipyard/internal/db"
	"shipyard/internal/secure"
)

type Manifest struct {
	Version        int       `json:"version"`
	CreatedAt      time.Time `json:"createdAt"`
	MasterKey      string    `json:"masterKey"`
	ProductVersion string    `json:"productVersion,omitempty"`
	SchemaVersion  int       `json:"schemaVersion,omitempty"`
}

func Export(ctx context.Context, s *db.Store, databaseURL, dataDir, passphrase string) ([]byte, error) {
	return ExportWithFiles(ctx, s, databaseURL, dataDir, passphrase, nil)
}
func ExportWithFiles(ctx context.Context, s *db.Store, databaseURL, dataDir, passphrase string, extra map[string][]byte) ([]byte, error) {
	var running int
	if err := s.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE state='running'").Scan(&running); err != nil {
		return nil, err
	}
	if running > 0 {
		return nil, errors.New("wait for running jobs to finish before exporting")
	}
	var archive bytes.Buffer
	gz := gzip.NewWriter(&archive)
	tw := tar.NewWriter(gz)
	add := func(name string, b []byte) error {
		if e := tw.WriteHeader(&tar.Header{Name: name, Mode: 0600, Size: int64(len(b))}); e != nil {
			return e
		}
		_, e := tw.Write(b)
		return e
	}
	manifest, _ := json.Marshal(Manifest{Version: 1, CreatedAt: time.Now(), MasterKey: s.Vault.Key(), ProductVersion: buildinfo.Version, SchemaVersion: db.LatestSchema()})
	if e := add("manifest.json", manifest); e != nil {
		return nil, e
	}
	var dump, stderr bytes.Buffer
	cmd, e := pgCommand(ctx, "pg_dump", databaseURL, "--format=custom", "--no-owner", "--no-acl")
	if e != nil {
		return nil, e
	}
	cmd.Stdout = &dump
	cmd.Stderr = &stderr
	if e := cmd.Run(); e != nil {
		return nil, fmt.Errorf("pg_dump failed: %w", e)
	}
	if e := add("database.dump", dump.Bytes()); e != nil {
		return nil, e
	}
	if e := filepath.WalkDir(dataDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if d.Name() == "source" || strings.HasPrefix(d.Name(), "source-") {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return errors.New("backup data directory contains a symlink")
		}
		rel, e := filepath.Rel(dataDir, path)
		if e != nil {
			return e
		}
		b, e := os.ReadFile(path)
		if e != nil {
			return e
		}
		return add("data/"+filepath.ToSlash(rel), b)
	}); e != nil {
		return nil, e
	}
	for name, content := range extra {
		if !filepath.IsLocal(name) || strings.Contains(name, "\\") {
			return nil, errors.New("invalid backup extra path")
		}
		if e := add("data/installation/"+name, content); e != nil {
			return nil, e
		}
	}
	if e := tw.Close(); e != nil {
		return nil, e
	}
	if e := gz.Close(); e != nil {
		return nil, e
	}
	return secure.EncryptBackup(passphrase, archive.Bytes())
}

// Restore targets a fresh database while the server is stopped. It never modifies remote application data.
func Restore(ctx context.Context, databaseURL, dataDir, passphrase string, encrypted []byte) (string, error) {
	if entries, e := os.ReadDir(dataDir); e == nil && len(entries) > 0 {
		return "", errors.New("restore requires an empty data directory")
	}
	plain, e := secure.DecryptBackup(passphrase, encrypted)
	if e != nil {
		return "", errors.New("invalid backup or passphrase")
	}
	gz, e := gzip.NewReader(bytes.NewReader(plain))
	if e != nil {
		return "", e
	}
	defer gz.Close()
	tr := tar.NewReader(io.LimitReader(gz, 2<<30))
	var manifest Manifest
	var dump []byte
	files := map[string][]byte{}
	for {
		h, e := tr.Next()
		if e == io.EOF {
			break
		}
		if e != nil {
			return "", e
		}
		if h.Typeflag != tar.TypeReg || h.Size > 1<<30 {
			return "", errors.New("invalid backup entry")
		}
		b, e := io.ReadAll(io.LimitReader(tr, h.Size+1))
		if e != nil {
			return "", e
		}
		if int64(len(b)) != h.Size {
			return "", errors.New("truncated backup entry")
		}
		switch h.Name {
		case "manifest.json":
			if e = json.Unmarshal(b, &manifest); e != nil {
				return "", e
			}
		case "database.dump":
			dump = b
		default:
			if !strings.HasPrefix(h.Name, "data/") {
				return "", errors.New("unknown backup entry")
			}
			rel := strings.TrimPrefix(h.Name, "data/")
			if !filepath.IsLocal(rel) || strings.Contains(rel, "\\") {
				return "", errors.New("unsafe backup path")
			}
			files[rel] = b
		}
	}
	if manifest.Version != 1 || len(dump) == 0 {
		return "", errors.New("unsupported or incomplete backup")
	}
	if _, e = secure.New(manifest.MasterKey); e != nil {
		return "", e
	}
	test, e := pgCommand(ctx, "psql", databaseURL, "-At", "-c", "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
	if e != nil {
		return "", e
	}
	out, e := test.Output()
	if e != nil {
		return "", e
	}
	if strings.TrimSpace(string(out)) != "0" {
		return "", errors.New("restore requires an empty target database")
	}
	cmd, e := pgCommand(ctx, "pg_restore", databaseURL, "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction")
	if e != nil {
		return "", e
	}
	cmd.Stdin = bytes.NewReader(dump)
	if e = cmd.Run(); e != nil {
		return "", fmt.Errorf("pg_restore failed: %w", e)
	}
	cleanup, e := pgCommand(ctx, "psql", databaseURL, "-v", "ON_ERROR_STOP=1", "-c", "DELETE FROM settings WHERE key='platform-update' OR key LIKE 'platform-update:%' OR key LIKE 'platform-plan:%'; UPDATE settings SET value='true' WHERE key='maintenance'")
	if e != nil {
		return "", e
	}
	if e = cleanup.Run(); e != nil {
		return "", e
	}
	if e = os.MkdirAll(dataDir, 0700); e != nil {
		return "", e
	}
	for rel, b := range files {
		target := filepath.Join(dataDir, filepath.FromSlash(rel))
		if e = os.MkdirAll(filepath.Dir(target), 0700); e != nil {
			return "", e
		}
		if e = os.WriteFile(target, b, 0600); e != nil {
			return "", e
		}
	}
	if e = os.WriteFile(filepath.Join(dataDir, "restored-master-key"), []byte(manifest.MasterKey), 0600); e != nil {
		return "", e
	}
	return filepath.Join(dataDir, "restored-master-key"), nil
}
func pgCommand(ctx context.Context, tool, databaseURL string, args ...string) (*exec.Cmd, error) {
	parsed, e := url.Parse(databaseURL)
	if e != nil {
		return nil, e
	}
	if parsed.Scheme != "postgres" && parsed.Scheme != "postgresql" {
		return nil, errors.New("backup tools require a PostgreSQL connection URL")
	}
	database := strings.TrimPrefix(parsed.Path, "/")
	if database == "" {
		return nil, errors.New("database name is required")
	}
	cmd := exec.CommandContext(ctx, tool, append([]string{"--dbname=" + database}, args...)...)
	cmd.Env = append(os.Environ(), "PGHOST="+parsed.Hostname(), "PGPORT="+parsed.Port(), "PGDATABASE="+database)
	if parsed.User != nil {
		cmd.Env = append(cmd.Env, "PGUSER="+parsed.User.Username())
		if password, ok := parsed.User.Password(); ok {
			cmd.Env = append(cmd.Env, "PGPASSWORD="+password)
		}
	}
	for key, env := range map[string]string{"sslmode": "PGSSLMODE", "sslrootcert": "PGSSLROOTCERT", "sslcert": "PGSSLCERT", "sslkey": "PGSSLKEY"} {
		if value := parsed.Query().Get(key); value != "" {
			cmd.Env = append(cmd.Env, env+"="+value)
		}
	}
	return cmd, nil
}
