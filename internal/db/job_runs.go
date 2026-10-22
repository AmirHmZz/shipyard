package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
	"time"
)

const ActiveJobStates = "('queued','running','retry_wait','cancelling')"

type JobBusyError struct{ RunID string }

func (e *JobBusyError) Error() string { return "Job is busy; active run: " + e.RunID }

func scanJobSettings(row pgx.Row) (model.JobSettings, error) {
	s := model.DefaultJobSettings()
	err := row.Scan(&s.Version, &s.Enabled, &s.Cron, &s.Timezone, &s.TimeoutSeconds, &s.Retries, &s.RetryDelaySeconds, &s.NextDue)
	s.Preview(time.Now())
	return s, err
}

const jobSettingsColumns = "version,enabled,cron,timezone,timeout_seconds,retries,retry_delay_seconds,next_due"

func (s *Store) JobSettings(ctx context.Context, app string) (model.JobSettings, error) {
	p, err := scanJobSettings(s.Pool.QueryRow(ctx, "SELECT "+jobSettingsColumns+" FROM job_settings WHERE app_id=$1", app))
	if errors.Is(err, pgx.ErrNoRows) {
		return model.DefaultJobSettings(), nil
	}
	return p, err
}
func (s *Store) SaveJobSettings(ctx context.Context, app string, p model.JobSettings) (model.JobSettings, error) {
	if err := p.Validate(); err != nil {
		return p, err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return p, err
	}
	defer tx.Rollback(ctx)
	if err = lockJobApp(ctx, tx, app); err != nil {
		return p, err
	}
	if p.Enabled {
		var ready bool
		if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM app_runtime WHERE app_id=$1)", app).Scan(&ready); err != nil {
			return p, err
		}
		if !ready {
			return p, errors.New("deploy a Job release before enabling its schedule")
		}
	}
	p.NextDue = nil
	if p.Enabled {
		schedule, _ := p.Schedule()
		next := schedule.Next(time.Now())
		p.NextDue = &next
	}
	if p.Version == 0 {
		tag, e := tx.Exec(ctx, "INSERT INTO job_settings(app_id,enabled,cron,timezone,timeout_seconds,retries,retry_delay_seconds,next_due) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING", app, p.Enabled, p.Cron, p.Timezone, p.TimeoutSeconds, p.Retries, p.RetryDelaySeconds, p.NextDue)
		err = e
		if err == nil && tag.RowsAffected() != 1 {
			return p, ErrConflict
		}
		if err != nil {
			return p, err
		}
		var version int64
		err = tx.QueryRow(ctx, "SELECT version FROM job_settings WHERE app_id=$1", app).Scan(&version)
		if version != 1 {
			return p, ErrConflict
		}
	} else {
		tag, e := tx.Exec(ctx, "UPDATE job_settings SET version=version+1,enabled=$2,cron=$3,timezone=$4,timeout_seconds=$5,retries=$6,retry_delay_seconds=$7,next_due=$8,checked_at=now() WHERE app_id=$1 AND version=$9", app, p.Enabled, p.Cron, p.Timezone, p.TimeoutSeconds, p.Retries, p.RetryDelaySeconds, p.NextDue, p.Version)
		if e != nil {
			return p, e
		}
		if tag.RowsAffected() != 1 {
			return p, ErrConflict
		}
	}
	if err != nil {
		return p, err
	}
	p.Version++
	p.Preview(time.Now())
	return p, tx.Commit(ctx)
}
func lockJobApp(ctx context.Context, tx pgx.Tx, app string) error {
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	var maintenance bool
	if err := tx.QueryRow(ctx, "SELECT COALESCE((SELECT value::text='true' FROM settings WHERE key='maintenance'),false)").Scan(&maintenance); err != nil {
		return err
	}
	if maintenance {
		return errors.New("Shipyard is in maintenance mode")
	}
	var data []byte
	if err := tx.QueryRow(ctx, "SELECT data FROM resources WHERE id=$1 AND kind='application' FOR UPDATE", app).Scan(&data); err != nil {
		return err
	}
	var a model.App
	if err := json.Unmarshal(data, &a); err != nil {
		return err
	}
	if !a.IsJob() {
		return errors.New("Job application required")
	}
	var deleting bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM resources WHERE (id=$1 OR id=$2) AND data->>'deleting'='true')", app, a.ServerID).Scan(&deleting); err != nil {
		return err
	}
	if deleting {
		return ErrDeleting
	}
	return nil
}
func (s *Store) QueueJobRun(ctx context.Context, app, actor, key string) (model.JobRun, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return model.JobRun{}, err
	}
	defer tx.Rollback(ctx)
	if err = lockJobApp(ctx, tx, app); err != nil {
		return model.JobRun{}, err
	}
	if key != "" {
		key = "manual:" + app + ":" + key
		var id string
		err = tx.QueryRow(ctx, "SELECT id FROM job_runs WHERE dedupe=$1", key).Scan(&id)
		if err == nil {
			return s.JobRun(ctx, app, id)
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return model.JobRun{}, err
		}
	}
	p, err := scanJobSettings(tx.QueryRow(ctx, "SELECT "+jobSettingsColumns+" FROM job_settings WHERE app_id=$1", app))
	if errors.Is(err, pgx.ErrNoRows) {
		p = model.DefaultJobSettings()
	} else if err != nil {
		return model.JobRun{}, err
	}
	run, err := insertJobRun(ctx, tx, app, actor, key, "manual", p, false)
	if err != nil {
		return run, err
	}
	return run, tx.Commit(ctx)
}
func insertJobRun(ctx context.Context, tx pgx.Tx, app, actor, key, trigger string, p model.JobSettings, skip bool) (model.JobRun, error) {
	r := model.JobRun{ID: uuid.NewString(), AppID: app, Actor: actor, State: "queued", Trigger: trigger, Policy: p, CreatedAt: time.Now(), Attempts: []model.JobAttempt{}}
	err := tx.QueryRow(ctx, "SELECT release_id FROM app_runtime WHERE app_id=$1", app).Scan(&r.ReleaseID)
	if err != nil {
		return r, errors.New("deploy a Job release before running it")
	}
	var active string
	err = tx.QueryRow(ctx, "SELECT id FROM job_runs WHERE app_id=$1 AND (state IN "+ActiveJobStates+" OR cleanup_pending)", app).Scan(&active)
	if err == nil {
		if trigger == "manual" {
			return r, &JobBusyError{active}
		}
		skip = true
		r.Error = "Skipped: another run is active"
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return r, err
	}
	if skip {
		r.State = "skipped"
		r.FinishedAt = &r.CreatedAt
		if r.Error == "" {
			r.Error = "Skipped missed schedule window"
		}
	}
	policy, _ := json.Marshal(p)
	_, err = tx.Exec(ctx, "INSERT INTO job_runs(id,app_id,release_id,state,trigger,actor,dedupe,policy,finished_at,error) VALUES($1,$2,$3,$4,$5,$6,NULLIF($7,''),$8,$9,$10)", r.ID, app, r.ReleaseID, r.State, trigger, actor, key, policy, r.FinishedAt, r.Error)
	if err == nil && !skip {
		_, err = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,'job-reconcile',$2,jsonb_build_object('runId',$3::text),$4)", "job-reconcile-"+r.ID, app, r.ID, "job-run:"+r.ID)
	}
	return r, err
}

const runColumns = "id,app_id,release_id,state,trigger,actor,policy,created_at,finished_at,retry_at,error,cleanup_pending"

func scanJobRun(row pgx.Row) (model.JobRun, error) {
	var r model.JobRun
	var policy []byte
	err := row.Scan(&r.ID, &r.AppID, &r.ReleaseID, &r.State, &r.Trigger, &r.Actor, &policy, &r.CreatedAt, &r.FinishedAt, &r.RetryAt, &r.Error, &r.CleanupPending)
	if err == nil {
		err = json.Unmarshal(policy, &r.Policy)
	}
	r.Attempts = []model.JobAttempt{}
	return r, err
}
func (s *Store) JobRun(ctx context.Context, app, id string) (model.JobRun, error) {
	r, err := scanJobRun(s.Pool.QueryRow(ctx, "SELECT "+runColumns+" FROM job_runs WHERE app_id=$1 AND id=$2", app, id))
	if err != nil {
		return r, err
	}
	rows, err := s.Pool.Query(ctx, "SELECT number,container,state,started_at,deadline,finished_at,exit_code,log_bytes,log_lines,logs_complete,cleaned FROM job_attempts WHERE run_id=$1 ORDER BY number", id)
	if err != nil {
		return r, err
	}
	defer rows.Close()
	for rows.Next() {
		var a model.JobAttempt
		if err = rows.Scan(&a.Number, &a.Container, &a.State, &a.StartedAt, &a.Deadline, &a.FinishedAt, &a.ExitCode, &a.LogBytes, &a.LogLines, &a.LogsComplete, &a.Cleaned); err != nil {
			return r, err
		}
		r.Attempts = append(r.Attempts, a)
	}
	return r, rows.Err()
}
func (s *Store) JobRuns(ctx context.Context, app, before string) ([]model.JobRun, error) {
	rows, err := s.Pool.Query(ctx, "SELECT "+runColumns+" FROM job_runs WHERE app_id=$1 AND ($2='' OR (created_at,id)<(SELECT created_at,id FROM job_runs WHERE id=$2 AND app_id=$1)) ORDER BY created_at DESC,id DESC LIMIT 50", app, before)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.JobRun{}
	for rows.Next() {
		r, e := scanJobRun(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (s *Store) ActiveJobRun(ctx context.Context, app string) (*model.JobRun, error) {
	var id string
	err := s.Pool.QueryRow(ctx, "SELECT id FROM job_runs WHERE app_id=$1 AND (state IN "+ActiveJobStates+" OR cleanup_pending)", app).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r, err := s.JobRun(ctx, app, id)
	return &r, err
}
func (s *Store) JobEvents(ctx context.Context, run string, after int64) ([]model.JobRunEvent, error) {
	rows, err := s.Pool.Query(ctx, "SELECT id,run_id,attempt,message,created_at FROM job_run_events WHERE run_id=$1 AND id>$2 ORDER BY id LIMIT 500", run, after)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.JobRunEvent{}
	for rows.Next() {
		var e model.JobRunEvent
		if err = rows.Scan(&e.ID, &e.RunID, &e.Attempt, &e.Message, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
func (s *Store) CancelJobRun(ctx context.Context, app, id string) error {
	_, err := s.Pool.Exec(ctx, "UPDATE job_runs SET state=CASE WHEN state IN ('queued','retry_wait') THEN 'cancelled' ELSE 'cancelling' END,finished_at=CASE WHEN state IN ('queued','retry_wait') THEN now() ELSE finished_at END,cleanup_pending=EXISTS(SELECT 1 FROM job_attempts WHERE run_id=$2 AND NOT cleaned) WHERE app_id=$1 AND id=$2 AND state IN "+ActiveJobStates, app, id)
	return err
}

// DispatchJobSchedules atomically advances cursors and reserves execution slots.
func (s *Store) DispatchJobSchedules(ctx context.Context, startup bool) error {
	rows, err := s.Pool.Query(ctx, "SELECT app_id FROM job_settings WHERE enabled")
	if err != nil {
		return err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, app := range ids {
		if err = s.dispatchJobSchedule(ctx, app, startup); err != nil && !errors.Is(err, ErrDeleting) {
			return err
		}
	}
	return nil
}
func (s *Store) dispatchJobSchedule(ctx context.Context, app string, startup bool) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = lockJobApp(ctx, tx, app); err != nil {
		return err
	}
	p, err := scanJobSettings(tx.QueryRow(ctx, "SELECT "+jobSettingsColumns+" FROM job_settings WHERE app_id=$1 AND enabled FOR UPDATE", app))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	now := time.Now()
	var checked time.Time
	if err = tx.QueryRow(ctx, "SELECT checked_at FROM job_settings WHERE app_id=$1", app).Scan(&checked); err != nil {
		return err
	}
	if p.NextDue != nil && !p.NextDue.After(now) {
		key := fmt.Sprintf("schedule:%s:%d:%d", app, p.Version, p.NextDue.Unix())
		if _, err = insertJobRun(ctx, tx, app, "scheduler", key, "schedule", p, startup || now.Sub(checked) > 75*time.Second); err != nil {
			return err
		}
		schedule, e := p.Schedule()
		if e != nil {
			return e
		}
		next := schedule.Next(now)
		p.NextDue = &next
	}
	_, err = tx.Exec(ctx, "UPDATE job_settings SET next_due=$2,checked_at=$3 WHERE app_id=$1", app, p.NextDue, now)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
