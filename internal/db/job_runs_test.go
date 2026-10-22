package db

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"shipyard/internal/model"
	"sync"
	"testing"
	"time"
)

func jobStoreFixture(t *testing.T) (*Store, model.Resource, model.Release) {
	t.Helper()
	s := testStore(t)
	ctx := context.Background()
	data, _ := json.Marshal(model.App{Workload: "job", Engine: "compose", JobService: "task"})
	app, err := s.Save(ctx, "", model.ResourceInput{Kind: "application", Name: "job", Data: data})
	if err != nil {
		t.Fatal(err)
	}
	d := uuid.NewString()
	if _, err = s.Pool.Exec(ctx, "INSERT INTO deployments(id,app_id,snapshot) VALUES($1,$2,$3)", d, app.ID, []byte{}); err != nil {
		t.Fatal(err)
	}
	release := model.Release{ID: uuid.NewString(), AppID: app.ID, DeploymentID: d, App: model.App{Workload: "job"}}
	if err = s.SaveRelease(ctx, release); err != nil {
		t.Fatal(err)
	}
	if err = s.Activate(ctx, release); err != nil {
		t.Fatal(err)
	}
	return s, app, release
}
func TestJobSingleRunIdempotencyAndPolicySnapshot(t *testing.T) {
	s, app, release := jobStoreFixture(t)
	ctx := context.Background()
	p := model.DefaultJobSettings()
	p.Retries = 2
	saved, err := s.SaveJobSettings(ctx, app.ID, p)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.SaveJobSettings(ctx, app.ID, p); !errors.Is(err, ErrConflict) {
		t.Fatal("stale initial save accepted", err)
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := []model.JobRun{}
	failures := []error{}
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, e := s.QueueJobRun(ctx, app.ID, "operator", uuid.NewString())
			mu.Lock()
			defer mu.Unlock()
			if e != nil {
				failures = append(failures, e)
			} else {
				success = append(success, r)
			}
		}()
	}
	wg.Wait()
	if len(success) != 1 || len(failures) != 7 {
		t.Fatal(len(success), failures)
	}
	for _, e := range failures {
		var busy *JobBusyError
		if !errors.As(e, &busy) || busy.RunID != success[0].ID {
			t.Fatal(e)
		}
	}
	if success[0].ReleaseID != release.ID || success[0].Policy.Retries != 2 {
		t.Fatal(success[0])
	}
	var jobs int
	if err = s.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE kind='job-reconcile'").Scan(&jobs); err != nil || jobs != 1 {
		t.Fatal("run and queue were not committed together", jobs, err)
	}
	saved.Retries = 0
	if _, err = s.SaveJobSettings(ctx, app.ID, saved); err != nil {
		t.Fatal(err)
	}
	_, _ = s.Pool.Exec(ctx, "UPDATE job_runs SET state='retry_wait' WHERE id=$1", success[0].ID)
	if _, err = s.QueueJobRun(ctx, app.ID, "operator", "busy"); err == nil {
		t.Fatal("retry wait released concurrency slot")
	}
	if err = s.CancelJobRun(ctx, app.ID, success[0].ID); err != nil {
		t.Fatal(err)
	}
	r, err := s.QueueJobRun(ctx, app.ID, "operator", "same-request")
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.QueueJobRun(ctx, app.ID, "operator", "same-request")
	if err != nil || again.ID != r.ID {
		t.Fatal("idempotency failed", again, err)
	}
	if r.Policy.Retries != 0 {
		t.Fatal("new policy not applied")
	}
	_, _ = s.Pool.Exec(ctx, "UPDATE job_runs SET state='failed',cleanup_pending=true WHERE id=$1", r.ID)
	if _, err = s.QueueJobRun(ctx, app.ID, "operator", "pending-cleanup"); err == nil {
		t.Fatal("pending cleanup released the execution slot")
	}
}
func TestJobScheduleMissedBusyAndCursor(t *testing.T) {
	s, app, _ := jobStoreFixture(t)
	ctx := context.Background()
	p := model.DefaultJobSettings()
	p.Enabled = true
	p.Cron = "* * * * *"
	p, err := s.SaveJobSettings(ctx, app.ID, p)
	if err != nil {
		t.Fatal(err)
	}
	due := time.Now().Add(-time.Second)
	if _, err = s.Pool.Exec(ctx, "UPDATE job_settings SET next_due=$2 WHERE app_id=$1", app.ID, due); err != nil {
		t.Fatal(err)
	}
	if err = s.DispatchJobSchedules(ctx, false); err != nil {
		t.Fatal(err)
	}
	runs, err := s.JobRuns(ctx, app.ID, "")
	if err != nil || len(runs) != 1 || runs[0].State != "queued" {
		t.Fatal(runs, err)
	}
	if err = s.DispatchJobSchedules(ctx, false); err != nil {
		t.Fatal(err)
	}
	runs, _ = s.JobRuns(ctx, app.ID, "")
	if len(runs) != 1 {
		t.Fatal("duplicate dispatch")
	}
	_, _ = s.Pool.Exec(ctx, "UPDATE job_settings SET next_due=$2 WHERE app_id=$1", app.ID, due.Add(-time.Minute))
	if err = s.DispatchJobSchedules(ctx, false); err != nil {
		t.Fatal(err)
	}
	runs, _ = s.JobRuns(ctx, app.ID, "")
	if len(runs) != 2 || runs[0].State != "skipped" {
		t.Fatal(runs)
	}
	_ = s.CancelJobRun(ctx, app.ID, runs[1].ID)
	_, _ = s.Pool.Exec(ctx, "UPDATE job_settings SET next_due=now()-interval '1 day',checked_at=now()-interval '1 day' WHERE app_id=$1", app.ID)
	if err = s.DispatchJobSchedules(ctx, true); err != nil {
		t.Fatal(err)
	}
	runs, _ = s.JobRuns(ctx, app.ID, "")
	if len(runs) != 3 || runs[0].State != "skipped" || runs[0].Error != "Skipped missed schedule window" {
		t.Fatal(runs)
	}
	p.Enabled = false
	if _, err = s.SaveJobSettings(ctx, app.ID, p); err != nil {
		t.Fatal(err)
	}
	settings, _ := s.JobSettings(ctx, app.ID)
	if settings.NextDue != nil {
		t.Fatal("disabled schedule retained cursor")
	}
}
func TestJobWorkloadImmutabilityAndMaintenance(t *testing.T) {
	s, app, _ := jobStoreFixture(t)
	ctx := context.Background()
	if _, err := s.Save(ctx, app.ID, model.ResourceInput{Kind: "application", Name: app.Name, Version: app.Version, Data: json.RawMessage(`{"workload":"service"}`)}); err == nil {
		t.Fatal("workload changed")
	}
	_, _ = s.Pool.Exec(ctx, "UPDATE settings SET value='true' WHERE key='maintenance'")
	if _, err := s.QueueJobRun(ctx, app.ID, "operator", ""); err == nil {
		t.Fatal("run admitted during maintenance")
	}
}
