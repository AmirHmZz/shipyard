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

const (
	backupEntryLimit   = 1 << 30
	backupArchiveLimit = 2 << 30
	restoreJournal     = ".shipyard-restore"
)

var (
	errEntryTooLarge   = errors.New("backup entry exceeds the 1 GiB restore limit")
	errArchiveTooLarge = errors.New("uncompressed backup exceeds the 2 GiB restore limit")
)

type boundedWriter struct {
	dst       io.Writer
	remaining int64
	limitErr  error
	exceeded  bool
}

func (w *boundedWriter) Write(p []byte) (int, error) {
	if int64(len(p)) > w.remaining {
		w.exceeded = true
		return 0, w.limitErr
	}
	n, err := w.dst.Write(p)
	w.remaining -= int64(n)
	return n, err
}

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
	if err := s.Pool.QueryRow(ctx, "SELECT (SELECT count(*) FROM jobs WHERE state='running')+(SELECT count(*) FROM job_runs WHERE state IN ('queued','running','retry_wait','cancelling') OR cleanup_pending)").Scan(&running); err != nil {
		return nil, err
	}
	if running > 0 {
		return nil, errors.New("wait for running jobs to finish before exporting")
	}
	var archive bytes.Buffer
	gz := gzip.NewWriter(&archive)
	tw := tar.NewWriter(&boundedWriter{dst: gz, remaining: backupArchiveLimit, limitErr: errArchiveTooLarge})
	add := func(name string, size int64, data io.Reader) error {
		if size > backupEntryLimit {
			return errEntryTooLarge
		}
		if e := tw.WriteHeader(&tar.Header{Name: name, Mode: 0600, Size: size}); e != nil {
			return e
		}
		_, e := io.Copy(tw, data)
		return e
	}
	manifest, _ := json.Marshal(Manifest{Version: 1, CreatedAt: time.Now(), MasterKey: s.Vault.Key(), ProductVersion: buildinfo.Version, SchemaVersion: db.LatestSchema()})
	if e := add("manifest.json", int64(len(manifest)), bytes.NewReader(manifest)); e != nil {
		return nil, e
	}
	var dump bytes.Buffer
	cmd, e := pgCommand(ctx, "pg_dump", databaseURL, "--format=custom", "--no-owner", "--no-acl",
		"--exclude-table-data=public.mcp_tokens", "--exclude-table-data=public.mcp_token_projects")
	if e != nil {
		return nil, e
	}
	output := &boundedWriter{dst: &dump, remaining: backupEntryLimit, limitErr: errEntryTooLarge}
	cmd.Stdout = output
	if e := cmd.Run(); e != nil {
		if output.exceeded {
			return nil, errEntryTooLarge
		}
		return nil, fmt.Errorf("pg_dump failed: %w", e)
	}
	if e := add("database.dump", int64(dump.Len()), &dump); e != nil {
		return nil, e
	}
	if e := filepath.WalkDir(dataDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == filepath.Join(dataDir, restoreJournal) {
			return errors.New("finish the interrupted restore before exporting")
		}
		if d.IsDir() {
			if d.Name() == "source" || strings.HasPrefix(d.Name(), "source-") {
				return filepath.SkipDir
			}
			return nil
		}
		if !d.Type().IsRegular() {
			return errors.New("backup data directory contains a non-regular file")
		}
		rel, e := filepath.Rel(dataDir, path)
		if e != nil {
			return e
		}
		f, e := os.Open(path)
		if e != nil {
			return e
		}
		defer f.Close()
		info, e := f.Stat()
		if e != nil {
			return e
		}
		return add("data/"+filepath.ToSlash(rel), info.Size(), f)
	}); e != nil {
		return nil, e
	}
	for name, content := range extra {
		if !filepath.IsLocal(name) || strings.Contains(name, "\\") {
			return nil, errors.New("invalid backup extra path")
		}
		if e := add("data/installation/"+name, int64(len(content)), bytes.NewReader(content)); e != nil {
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

func readArchive(plain []byte, entryLimit, archiveLimit int64) (Manifest, []byte, map[string][]byte, error) {
	var manifest Manifest
	var dump []byte
	files := map[string][]byte{}
	gz, e := gzip.NewReader(bytes.NewReader(plain))
	if e != nil {
		return manifest, nil, nil, e
	}
	defer gz.Close()
	limited := &io.LimitedReader{R: gz, N: archiveLimit + 1}
	tr := tar.NewReader(limited)
	for {
		remaining := limited.N
		h, e := tr.Next()
		if limited.N == 0 {
			return manifest, nil, nil, errArchiveTooLarge
		}
		if e == io.EOF {
			if remaining-limited.N < 1024 {
				return manifest, nil, nil, errors.New("backup archive is missing its tar end marker")
			}
			break
		}
		if e != nil {
			return manifest, nil, nil, e
		}
		if h.Typeflag != tar.TypeReg {
			return manifest, nil, nil, errors.New("invalid backup entry")
		}
		if h.Size > entryLimit {
			return manifest, nil, nil, errEntryTooLarge
		}
		if h.Size >= limited.N {
			return manifest, nil, nil, errArchiveTooLarge
		}
		b := make([]byte, int(h.Size))
		if _, e = io.ReadFull(tr, b); e != nil {
			return manifest, nil, nil, e
		}
		switch h.Name {
		case "manifest.json":
			if e = json.Unmarshal(b, &manifest); e != nil {
				return manifest, nil, nil, e
			}
		case "database.dump":
			dump = b
		default:
			if !strings.HasPrefix(h.Name, "data/") {
				return manifest, nil, nil, errors.New("unknown backup entry")
			}
			rel := filepath.FromSlash(strings.TrimPrefix(h.Name, "data/"))
			if !filepath.IsLocal(rel) || strings.Contains(h.Name, "\\") {
				return manifest, nil, nil, errors.New("unsafe backup path")
			}
			rel = filepath.Clean(rel)
			first, _, _ := strings.Cut(filepath.ToSlash(rel), "/")
			if rel == "." || first == restoreJournal {
				return manifest, nil, nil, errors.New("backup path conflicts with restore staging")
			}
			files[rel] = b
		}
	}
	if _, e = io.Copy(io.Discard, limited); e != nil {
		return manifest, nil, nil, e
	}
	if limited.N == 0 {
		return manifest, nil, nil, errArchiveTooLarge
	}
	if manifest.Version != 1 || len(dump) == 0 {
		return manifest, nil, nil, errors.New("unsupported or incomplete backup")
	}
	_, e = secure.New(manifest.MasterKey)
	return manifest, dump, files, e
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
