package db

import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"sort"
)

func (s *Store) DeleteJobRuns(ctx context.Context, app string, ids []string) error {
	if len(ids) == 0 || len(ids) > 50 {
		return errors.New("select between one and 50 runs")
	}
	ids = append([]string(nil), ids...)
	sort.Strings(ids)
	for i, id := range ids {
		if id == "" || (i > 0 && ids[i-1] == id) {
			return errors.New("select unique run IDs")
		}
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// Same advisory locks as reconciliation, in stable order for bulk deletion.
	for _, id := range ids {
		if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "job-run:"+id); err != nil {
			return err
		}
	}
	if err = lockJobApp(ctx, tx, app); err != nil {
		return err
	}
	for _, id := range ids {
		var protected bool
		err = tx.QueryRow(ctx, "SELECT state IN "+ActiveJobStates+" OR cleanup_pending OR EXISTS(SELECT 1 FROM job_attempts WHERE run_id=$2 AND (NOT cleaned OR NOT logs_complete)) FROM job_runs WHERE app_id=$1 AND id=$2 FOR UPDATE", app, id).Scan(&protected)
		if err != nil {
			return err
		}
		if protected {
			return fmt.Errorf("only finished runs with completed log capture and cleanup can be deleted: %w", ErrConflict)
		}
	}
	if _, err = tx.Exec(ctx, "DELETE FROM jobs WHERE kind='job-reconcile' AND payload->>'runId'=ANY($1)", ids); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, "DELETE FROM job_runs WHERE app_id=$1 AND id=ANY($2)", app, ids)
	if err != nil {
		return err
	}
	if int(tag.RowsAffected()) != len(ids) {
		return pgx.ErrNoRows
	}
	return tx.Commit(ctx)
}
