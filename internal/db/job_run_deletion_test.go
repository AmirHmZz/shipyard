package db

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"testing"
)

func TestDeleteJobRunsProtectsExecutionAndCascades(t *testing.T) {
	s, app, _ := jobStoreFixture(t)
	ctx := context.Background()
	run, err := s.QueueJobRun(ctx, app.ID, "operator", "first")
	if err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteJobRuns(ctx, app.ID, []string{run.ID}); !errors.Is(err, ErrConflict) {
		t.Fatal("deleted active run", err)
	}
	_, err = s.Pool.Exec(ctx, "UPDATE job_runs SET state='failed',finished_at=now(),cleanup_pending=true WHERE id=$1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteJobRuns(ctx, app.ID, []string{run.ID}); !errors.Is(err, ErrConflict) {
		t.Fatal("deleted cleanup-pending run", err)
	}
	_, err = s.Pool.Exec(ctx, "UPDATE job_runs SET cleanup_pending=false WHERE id=$1", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Pool.Exec(ctx, "INSERT INTO job_attempts(run_id,number,container,cleaned,logs_complete) VALUES($1,1,$1,true,true)", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Pool.Exec(ctx, "INSERT INTO job_run_events(run_id,message) VALUES($1,'retained output')", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteJobRuns(ctx, app.ID, []string{run.ID, "not-in-this-app"}); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal(err)
	}
	if _, err = s.JobRun(ctx, app.ID, run.ID); err != nil {
		t.Fatal("bulk deletion was not atomic", err)
	}
	if err = s.DeleteJobRuns(ctx, app.ID, []string{run.ID}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.JobRun(ctx, app.ID, run.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal(err)
	}
	events, err := s.JobEvents(ctx, run.ID, 0)
	if err != nil || len(events) != 0 {
		t.Fatal(events, err)
	}
	var count int
	if err = s.Pool.QueryRow(ctx, "SELECT count(*) FROM job_attempts WHERE run_id=$1", run.ID).Scan(&count); err != nil || count != 0 {
		t.Fatal(count, err)
	}
}
