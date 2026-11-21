package backup

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/jackc/pgx/v5"
	"shipyard/internal/secure"
)

const restoredKey = "restored-master-key"

// Restore runs offline against an empty database and data directory. A matching
// journal allows the same invocation to recover after an interrupted restore.
func Restore(ctx context.Context, databaseURL, dataDir, passphrase string, encrypted []byte) (string, error) {
	plain, err := secure.DecryptBackup(passphrase, encrypted)
	if err != nil {
		return "", errors.New("invalid backup or passphrase")
	}
	manifest, dump, files, err := readArchive(plain, backupEntryLimit, backupArchiveLimit)
	if err != nil {
		return "", err
	}
	files[restoredKey] = []byte(manifest.MasterKey)
	archiveHash := sha256.Sum256(encrypted)
	receipt := hex.EncodeToString(archiveHash[:])
	targetHash := sha256.Sum256([]byte(databaseURL))
	stamp := receipt + ":" + hex.EncodeToString(targetHash[:])

	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return "", err
	}
	defer conn.Close(context.WithoutCancel(ctx))
	if _, err = conn.Exec(ctx, "SELECT pg_advisory_lock(hashtextextended('shipyard-restore',0))"); err != nil {
		return "", err
	}
	var empty bool
	if err = conn.QueryRow(ctx, `SELECT
		NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND NOT starts_with(nspname,'pg_'))
		AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relnamespace=to_regnamespace('public'))
		AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace=to_regnamespace('public'))
		AND NOT EXISTS(SELECT 1 FROM pg_type WHERE typnamespace=to_regnamespace('public'))`).Scan(&empty); err != nil {
		return "", err
	}

	stage := filepath.Join(dataDir, restoreJournal)
	if info, e := os.Lstat(stage); e == nil && !info.IsDir() {
		return "", errors.New("restore journal path is occupied")
	} else if e != nil && !errors.Is(e, fs.ErrNotExist) {
		return "", e
	}
	saved, err := readRestoreJournal(stage)
	if err != nil {
		return "", err
	}
	resuming := saved != ""
	if resuming && saved != stamp {
		return "", errors.New("an interrupted restore requires the same backup and database URL")
	}
	if !empty {
		var committed bool
		err = conn.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM public.settings WHERE key='backup-restore-receipt' AND value=to_jsonb($1::text))", receipt).Scan(&committed)
		if err != nil || !committed {
			return "", errors.New("restore requires an empty target database")
		}
	}

	existing, err := inspectRestoreFiles(dataDir, files, resuming || !empty)
	if err != nil {
		return "", err
	}
	keyPath := filepath.Join(dataDir, restoredKey)
	if !empty {
		if len(existing) != len(files) {
			return "", errors.New("files are missing from the committed restore")
		}
		return keyPath, removeRestoreJournal(stage)
	}
	if err = os.MkdirAll(stage, 0700); err != nil {
		return "", err
	}
	if !resuming {
		if err = publishRestoreFile(stage, filepath.Join(stage, "archive"), []byte(stamp)); err != nil {
			return "", err
		}
		if err = syncDirectory(dataDir); err != nil {
			return "", err
		}
	}
	for rel, content := range files {
		if existing[rel] {
			continue
		}
		path := filepath.Join(dataDir, rel)
		if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			return "", err
		}
		if err = publishRestoreFile(stage, path, content); err != nil {
			return "", err
		}
		for parent := filepath.Dir(path); parent != filepath.Clean(dataDir); parent = filepath.Dir(parent) {
			if err = syncDirectory(filepath.Dir(parent)); err != nil {
				return "", err
			}
		}
	}
	if err = restorePostgres(ctx, databaseURL, stage, receipt, dump); err != nil {
		return "", err
	}
	return keyPath, removeRestoreJournal(stage)
}

func readRestoreJournal(stage string) (string, error) {
	entries, err := os.ReadDir(stage)
	if errors.Is(err, fs.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	var stamp string
	for _, entry := range entries {
		if !entry.Type().IsRegular() {
			return "", errors.New("restore journal contains an unrelated file")
		}
		name := entry.Name()
		switch {
		case name == "archive":
			raw, err := os.ReadFile(filepath.Join(stage, name))
			if err != nil {
				return "", err
			}
			if len(raw) != sha256.Size*4+1 {
				return "", errors.New("invalid restore journal")
			}
			stamp = string(raw)
		case restoreTempFile(name):
		default:
			return "", errors.New("restore journal contains an unrelated file")
		}
	}
	return stamp, nil
}

func restoreTempFile(name string) bool {
	return strings.HasPrefix(name, "publish-") || (strings.HasPrefix(name, "database-") && strings.HasSuffix(name, ".sql"))
}

// Only files and directories from this archive may exist outside the journal
// when resuming. Published files are matched by content before being reused.
func inspectRestoreFiles(dataDir string, files map[string][]byte, resuming bool) (map[string]bool, error) {
	existing := map[string]bool{}
	dirs := map[string]bool{}
	for name := range files {
		for dir := filepath.Dir(name); dir != "."; dir = filepath.Dir(dir) {
			if _, conflict := files[dir]; conflict {
				return nil, errors.New("backup contains conflicting file and directory paths")
			}
			dirs[dir] = true
		}
	}
	err := filepath.WalkDir(dataDir, func(path string, entry fs.DirEntry, err error) error {
		if path == dataDir {
			if errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			if err == nil && !entry.IsDir() {
				return errors.New("restore target must be a directory")
			}
			return err
		}
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(dataDir, path)
		if err != nil {
			return err
		}
		if rel == restoreJournal {
			return filepath.SkipDir
		}
		if resuming && dirs[rel] && entry.IsDir() {
			return nil
		}
		if content, ok := files[rel]; resuming && ok && entry.Type().IsRegular() {
			file, err := os.Open(path)
			if err != nil {
				return err
			}
			defer file.Close()
			hash := sha256.New()
			n, err := io.Copy(hash, io.LimitReader(file, int64(len(content))+1))
			if err != nil {
				return err
			}
			expected := sha256.Sum256(content)
			if n == int64(len(content)) && bytes.Equal(hash.Sum(nil), expected[:]) {
				existing[rel] = true
				return nil
			}
		}
		return errors.New("restore data directory contains unrelated or modified files")
	})
	return existing, err
}

func publishRestoreFile(stage, target string, content []byte) error {
	file, err := os.CreateTemp(stage, "publish-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	_, err = file.Write(content)
	if err == nil {
		err = file.Sync()
	}
	if err = errors.Join(err, file.Close()); err != nil {
		return err
	}
	if err = os.Rename(file.Name(), target); err != nil {
		return err
	}
	return syncDirectory(filepath.Dir(target))
}

func syncDirectory(path string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	dir, err := os.Open(path)
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

func restorePostgres(ctx context.Context, databaseURL, stage, receipt string, dump []byte) error {
	sql, err := os.CreateTemp(stage, "database-*.sql")
	if err != nil {
		return err
	}
	defer os.Remove(sql.Name())
	render := exec.CommandContext(ctx, "pg_restore", "--no-owner", "--no-acl", "--exit-on-error", "--file=-")
	render.Stdin = bytes.NewReader(dump)
	render.Stdout = sql
	if err = errors.Join(render.Run(), sql.Close()); err != nil {
		return fmt.Errorf("prepare database restore: %w", err)
	}
	// receipt is hex-encoded by Restore. Keep it in the same transaction as
	// the imported dump so it also proves the outcome of an interrupted commit.
	cleanup := `DELETE FROM public.settings WHERE key='platform-update' OR key LIKE 'platform-update:%' OR key LIKE 'platform-plan:%';
		INSERT INTO public.settings(key,value) VALUES ('maintenance','true'), ('backup-restore-receipt', to_jsonb('` + receipt + `'::text))
		ON CONFLICT(key) DO UPDATE SET value=excluded.value;`
	cmd, err := pgCommand(ctx, "psql", databaseURL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", sql.Name(), "-c", cleanup)
	if err != nil {
		return err
	}
	if err = cmd.Run(); err != nil {
		return fmt.Errorf("apply database restore: %w", err)
	}
	return nil
}

func removeRestoreJournal(stage string) error {
	entries, err := os.ReadDir(stage)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !entry.Type().IsRegular() || (entry.Name() != "archive" && !restoreTempFile(entry.Name())) {
			return errors.New("restore journal contains an unrelated file")
		}
		if entry.Name() == "archive" {
			continue
		}
		if err = os.Remove(filepath.Join(stage, entry.Name())); err != nil {
			return err
		}
	}
	if err = os.Remove(filepath.Join(stage, "archive")); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if err = os.Remove(stage); err != nil {
		return err
	}
	return syncDirectory(filepath.Dir(stage))
}
