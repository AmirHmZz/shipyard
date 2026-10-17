package db

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Direction struct {
	Classification string `json:"classification"`
	Impact         string `json:"impact"`
}
type Migration struct {
	Version      int       `json:"version"`
	Name         string    `json:"name"`
	Up           Direction `json:"up"`
	Down         Direction `json:"down"`
	UpChecksum   string    `json:"upChecksum"`
	DownChecksum string    `json:"downChecksum"`
	UpSQL        string    `json:"-"`
	DownSQL      string    `json:"-"`
}
type MigrationStatus struct {
	Current int             `json:"current"`
	Target  int             `json:"target"`
	Steps   []MigrationStep `json:"steps"`
}
type MigrationStep struct {
	Version        int    `json:"version"`
	Direction      string `json:"direction"`
	Checksum       string `json:"checksum"`
	Classification string `json:"classification"`
	Impact         string `json:"impact"`
}

var legacyChecksums = map[int]string{1: "68e03ee2db857ff4867c05e9e449e01cc0889a5754079cbb053457d35f7f4f27", 2: "f77e83238d3796fe48ecb0be820ddf6e284e84467414905014748a88b158a437", 3: "14ad598bfce402f244fab3e233b7b6300c2568e25d922d45fa0233b4ccd987a5"}

func checksum(s string) string {
	h := sha256.Sum256([]byte(strings.ReplaceAll(s, "\r\n", "\n")))
	return hex.EncodeToString(h[:])
}
func MigrationCatalog() ([]Migration, error) {
	entries, e := migrations.ReadDir("migrations")
	if e != nil {
		return nil, e
	}
	out := []Migration{}
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".sql") || strings.HasSuffix(name, ".down.sql") {
			continue
		}
		base := strings.TrimSuffix(name, ".sql")
		v, e := strconv.Atoi(strings.SplitN(base, "_", 2)[0])
		if e != nil {
			return nil, e
		}
		var m Migration
		raw, e := migrations.ReadFile("migrations/" + base + ".json")
		if e != nil {
			return nil, e
		}
		if e = json.Unmarshal(raw, &m); e != nil {
			return nil, e
		}
		m.Version = v
		up, e := migrations.ReadFile("migrations/" + name)
		if e != nil {
			return nil, e
		}
		down, e := migrations.ReadFile("migrations/" + base + ".down.sql")
		if e != nil {
			return nil, e
		}
		m.UpSQL = string(up)
		m.DownSQL = string(down)
		m.UpChecksum = checksum(m.UpSQL)
		m.DownChecksum = checksum(m.DownSQL)
		for _, d := range []Direction{m.Up, m.Down} {
			if d.Classification != "non-destructive" && d.Classification != "destructive" && d.Classification != "unsupported" {
				return nil, errors.New("invalid migration classification")
			}
			if d.Impact == "" {
				return nil, errors.New("migration impact is required")
			}
		}
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Version < out[j].Version })
	for i, m := range out {
		if m.Version != i+1 {
			return nil, errors.New("migration sequence has a gap")
		}
	}
	return out, nil
}
func LatestSchema() int {
	all, e := MigrationCatalog()
	if e != nil {
		panic(e)
	}
	return len(all)
}

type querier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func migrationState(ctx context.Context, q querier) (MigrationStatus, error) {
	out := MigrationStatus{Target: LatestSchema(), Steps: []MigrationStep{}}
	var exists bool
	if e := q.QueryRow(ctx, "SELECT to_regclass('schema_versions') IS NOT NULL").Scan(&exists); e != nil {
		return out, e
	}
	if !exists {
		return out, nil
	}
	all, e := MigrationCatalog()
	if e != nil {
		return out, e
	}
	rows, e := q.Query(ctx, "SELECT version,COALESCE(to_jsonb(s)->>'up_checksum',''),COALESCE(to_jsonb(s)->>'down_checksum','') FROM schema_versions s ORDER BY version")
	if e != nil {
		return out, e
	}
	defer rows.Close()
	for rows.Next() {
		var v int
		var up, down string
		if e = rows.Scan(&v, &up, &down); e != nil {
			return out, e
		}
		if v != out.Current+1 || v > len(all) {
			return out, errors.New("unknown or inconsistent migration history")
		}
		m := all[v-1]
		if up == "" {
			if legacyChecksums[v] != m.UpChecksum {
				return out, errors.New("unrecognized legacy migration checksum")
			}
		} else if up != m.UpChecksum || down != m.DownChecksum {
			return out, fmt.Errorf("migration %d checksum mismatch", v)
		}
		out.Current = v
	}
	return out, rows.Err()
}
func MigrationState(ctx context.Context, pool *pgxpool.Pool) (MigrationStatus, error) {
	return migrationState(ctx, pool)
}
func PlanMigrations(current, target int, all []Migration) (MigrationStatus, error) {
	out := MigrationStatus{Current: current, Target: target, Steps: []MigrationStep{}}
	if current < 0 || target < 0 || current > len(all) || target > len(all) {
		return out, errors.New("unsupported target schema")
	}
	if target > current {
		for _, m := range all[current:target] {
			out.Steps = append(out.Steps, MigrationStep{m.Version, "up", m.UpChecksum, m.Up.Classification, m.Up.Impact})
		}
	} else {
		for i := current - 1; i >= target; i-- {
			m := all[i]
			out.Steps = append(out.Steps, MigrationStep{m.Version, "down", m.DownChecksum, m.Down.Classification, m.Down.Impact})
		}
	}
	return out, nil
}
func ApplyMigrations(ctx context.Context, pool *pgxpool.Pool, target int, allowDestructive bool) error {
	tx, e := pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(73914228)"); e != nil {
		return e
	}
	state, e := migrationState(ctx, tx)
	if e != nil {
		return e
	}
	all, e := MigrationCatalog()
	if e != nil {
		return e
	}
	plan, e := PlanMigrations(state.Current, target, all)
	if e != nil {
		return e
	}
	for _, step := range plan.Steps {
		if step.Classification == "unsupported" {
			return errors.New("migration direction is unsupported")
		}
		if step.Classification == "destructive" && !allowDestructive {
			return errors.New("explicit data-loss approval is required")
		}
	}
	if _, e = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_versions(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());ALTER TABLE schema_versions ADD COLUMN IF NOT EXISTS up_checksum text;ALTER TABLE schema_versions ADD COLUMN IF NOT EXISTS down_checksum text`); e != nil {
		return e
	}
	for _, m := range all[:state.Current] {
		if _, e = tx.Exec(ctx, "UPDATE schema_versions SET up_checksum=$2,down_checksum=$3 WHERE version=$1 AND up_checksum IS NULL", m.Version, m.UpChecksum, m.DownChecksum); e != nil {
			return e
		}
	}
	for _, step := range plan.Steps {
		m := all[step.Version-1]
		sql := m.UpSQL
		if step.Direction == "down" {
			sql = m.DownSQL
		}
		if _, e = tx.Exec(ctx, sql); e != nil {
			return fmt.Errorf("migration %d %s failed: %w", step.Version, step.Direction, e)
		}
		if step.Direction == "up" {
			_, e = tx.Exec(ctx, "INSERT INTO schema_versions(version,up_checksum,down_checksum) VALUES($1,$2,$3)", m.Version, m.UpChecksum, m.DownChecksum)
		} else {
			_, e = tx.Exec(ctx, "DELETE FROM schema_versions WHERE version=$1", m.Version)
		}
		if e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}
