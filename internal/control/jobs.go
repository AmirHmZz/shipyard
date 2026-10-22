package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"io"
	"shipyard/internal/db"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"sort"
	"strings"
	"time"
)

func (c *Controller) jobScheduler(ctx context.Context) {
	startup := true
	tick := time.NewTicker(5 * time.Second)
	defer tick.Stop()
	for {
		if !c.Store.Maintenance(ctx) {
			if err := c.Store.DispatchJobSchedules(ctx, startup); err != nil {
				c.Logger.Error("dispatch Job schedules", "error", err)
			} else {
				startup = false
			}
		} else {
			startup = true
		}
		_, err := c.Store.Pool.Exec(ctx, `INSERT INTO jobs(id,kind,resource_id,payload,dedupe)
   SELECT 'job-reconcile-'||id,'job-reconcile',app_id,jsonb_build_object('runId',id),'job-run:'||id FROM job_runs
   WHERE state IN `+db.ActiveJobStates+` OR cleanup_pending OR (NOT notified AND state IN ('succeeded','failed','timed_out'))
   ON CONFLICT(dedupe) DO UPDATE SET state='queued',available_at=now(),worker=NULL,lease_until=NULL
   WHERE jobs.state IN ('done','failed')`)
		if err != nil {
			c.Logger.Error("enqueue Job reconciliation", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

var errJobLogPending = errors.New("Job logs have more batches to retain")

func (c *Controller) reconcileJob(ctx context.Context, app, id string) (result error) {
	run, err := c.Store.JobRun(ctx, app, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	defer func() {
		if errors.Is(result, errJobLogPending) {
			result = nil
			return
		}
		if result == nil {
			_, _ = c.Store.Pool.Exec(ctx, "UPDATE job_runs SET error='' WHERE id=$1 AND ((state IN "+db.ActiveJobStates+" AND starts_with(error,'Execution state is uncertain;')) OR (NOT cleanup_pending AND error='Container cleanup is pending; reconnecting to the server'))", id)
			return
		}
		if result != nil {
			update, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			_, _ = c.Store.Pool.Exec(update, "UPDATE job_runs SET error=CASE WHEN state IN "+db.ActiveJobStates+" THEN 'Execution state is uncertain; reconnecting. Cancel the run if startup remains unconfirmed.' WHEN error='' THEN 'Container cleanup is pending; reconnecting to the server' ELSE error END WHERE id=$1 AND (state IN "+db.ActiveJobStates+" OR cleanup_pending)", id)
			result = errors.New("Job reconciliation needs retry; inspect the run state")
		}
	}()
	resource, err := c.Store.Resource(ctx, app)
	if err != nil {
		return err
	}
	appSpec, _ := model.Decode[model.App](resource)
	host, hostErr := c.Store.Resource(ctx, appSpec.ServerID)
	if hostErr != nil {
		return hostErr
	}
	if (model.IsDeleting(resource) || model.IsDeleting(host)) && run.Active() {
		if err = c.Store.CancelJobRun(ctx, app, id); err != nil {
			return err
		}
		run, err = c.Store.JobRun(ctx, app, id)
		if err != nil {
			return err
		}
	}
	if !run.Active() {
		if err = c.notifyJobRun(ctx, resource, run); err != nil {
			return err
		}
		if !run.CleanupPending {
			return nil
		}
	}
	if !run.Active() && len(run.Attempts) == 0 {
		_, err = c.Store.Pool.Exec(ctx, "UPDATE job_runs SET cleanup_pending=false WHERE id=$1", id)
		return err
	}
	release, err := c.Store.Release(ctx, run.ReleaseID)
	if err != nil {
		return err
	}
	node, _, err := c.connect(ctx, release.ServerID)
	if err != nil {
		return err
	}
	defer node.Close()
	engine := &deploy.Engine{Remote: node, Log: io.Discard}
	starter := *engine
	starter.Guard = func(ctx context.Context) error {
		var allowed bool
		err := c.Store.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM job_runs j JOIN resources a ON a.id=j.app_id JOIN resources s ON s.id=$2 WHERE j.id=$1 AND j.state='running' AND COALESCE(a.data->>'deleting','false')<>'true' AND COALESCE(s.data->>'deleting','false')<>'true')`, id, release.ServerID).Scan(&allowed)
		if err != nil {
			return err
		}
		if !allowed || c.Store.Maintenance(ctx) {
			return errors.New("Job start was fenced by cancellation, deletion or maintenance")
		}
		return nil
	}
	// Clean all completed attempts before creating the next one.
	for _, attempt := range run.Attempts {
		if attempt.FinishedAt != nil && !attempt.Cleaned {
			if err = c.cleanupJobAttempt(ctx, engine, release, run, attempt); err != nil {
				return err
			}
		}
	}
	run, err = c.Store.JobRun(ctx, app, id)
	if err != nil {
		return err
	}
	if !run.Active() {
		// A cancellation may have won before a container was ever created.
		for _, a := range run.Attempts {
			if !a.Cleaned {
				if err = c.cleanupJobAttempt(ctx, engine, release, run, a); err != nil {
					return err
				}
			}
		}
		_, err = c.Store.Pool.Exec(ctx, "UPDATE job_runs SET cleanup_pending=false WHERE id=$1", id)
		if err != nil {
			return err
		}
		return c.notifyJobRun(ctx, resource, run)
	}
	if run.State == "retry_wait" && run.RetryAt != nil && time.Now().Before(*run.RetryAt) {
		return nil
	}
	if (run.State == "queued" || run.State == "retry_wait") && c.Store.Maintenance(ctx) {
		return nil
	}
	if run.State == "queued" || run.State == "retry_wait" {
		tx, e := c.Store.Pool.Begin(ctx)
		if e != nil {
			return e
		}
		defer tx.Rollback(ctx)
		var state string
		if e = tx.QueryRow(ctx, "SELECT state FROM job_runs WHERE id=$1 FOR UPDATE", id).Scan(&state); e != nil {
			return e
		}
		if state != run.State {
			return nil
		}
		number := len(run.Attempts) + 1
		name := fmt.Sprintf("syjob-%s-%d", id, number)
		if _, e = tx.Exec(ctx, "INSERT INTO job_attempts(run_id,number,container) VALUES($1,$2,$3)", id, number, name); e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, "UPDATE job_runs SET state='running',retry_at=NULL,error='',cleanup_pending=true WHERE id=$1", id); e != nil {
			return e
		}
		if e = tx.Commit(ctx); e != nil {
			return e
		}
		run, err = c.Store.JobRun(ctx, app, id)
		if err != nil {
			return err
		}
	}
	if len(run.Attempts) == 0 {
		return c.finishJobRun(ctx, run, "cancelled", "")
	}
	a := run.Attempts[len(run.Attempts)-1]
	container, err := engine.InspectJob(ctx, a)
	if err != nil {
		return err
	}
	if container != nil && (container.Config.Labels["shipyard.run"] != id || container.Config.Labels["shipyard.app"] != app || container.Config.Labels["shipyard.release"] != release.ID || container.Config.Labels["shipyard.attempt"] != fmt.Sprint(a.Number)) {
		return errors.New("Job container ownership mismatch")
	}
	current, err := c.Store.JobRun(ctx, app, id)
	if err != nil {
		return err
	}
	run.State = current.State
	if container == nil {
		if run.State == "cancelling" {
			return c.finishJobAttempt(ctx, run, a, "cancelled", nil)
		}
		if a.State != "creating" {
			return c.finishJobAttempt(ctx, run, a, "failed", nil)
		}
		if c.Store.Maintenance(ctx) {
			return nil
		}
		if err = starter.CreateJob(ctx, &release, run, a); err != nil {
			return err
		}
		container, err = engine.InspectJob(ctx, a)
		if err != nil {
			return err
		}
		if container == nil {
			return errors.New("Job container creation could not be confirmed")
		}
		if err = c.recordApplicationVolumes(ctx, node, release); err != nil {
			return err
		}
	}
	if container.State.Status == "created" {
		if run.State == "cancelling" {
			return c.finishJobAttempt(ctx, run, a, "cancelled", nil)
		}
		if c.Store.Maintenance(ctx) {
			return nil
		}
		if err = c.prepareNetworks(ctx, &release, []model.NetworkContainer{{ID: container.ID, Service: release.App.JobTarget(), Replica: 1}}); err != nil {
			return err
		}
		// This intent survives a lost start response; an exited container is never restarted.
		if _, err = c.Store.Pool.Exec(ctx, "UPDATE job_attempts SET state='starting',started_at=COALESCE(started_at,now()),deadline=COALESCE(deadline,now()+make_interval(secs=>$3)) WHERE run_id=$1 AND number=$2", id, a.Number, run.Policy.TimeoutSeconds); err != nil {
			return err
		}
		if err = starter.StartJob(ctx, release, a, container.ID); err != nil {
			return err
		}
		return nil
	}
	if a.StartedAt == nil {
		start, e := time.Parse(time.RFC3339Nano, container.State.StartedAt)
		if e != nil {
			return e
		}
		deadline := start.Add(time.Duration(run.Policy.TimeoutSeconds) * time.Second)
		if _, err = c.Store.Pool.Exec(ctx, "UPDATE job_attempts SET state='running',started_at=$3,deadline=$4 WHERE run_id=$1 AND number=$2", id, a.Number, start, deadline); err != nil {
			return err
		}
		a.StartedAt = &start
		a.Deadline = &deadline
	}
	timeout := a.Deadline != nil && !time.Now().Before(*a.Deadline)
	if container.State.Status == "running" || container.State.Status == "restarting" || container.State.Status == "paused" {
		if run.State == "cancelling" || timeout || a.State == "timing_out" {
			outcome := "timing_out"
			if run.State == "cancelling" {
				outcome = "cancelling"
			}
			if _, err = c.Store.Pool.Exec(ctx, "UPDATE job_attempts SET state=$3 WHERE run_id=$1 AND number=$2", id, a.Number, outcome); err != nil {
				return err
			}
			grace := 10
			if container.Config.StopTimeout != nil {
				grace = *container.Config.StopTimeout
			}
			if grace < 0 {
				grace = 0
			}
			var stopDeadline *time.Time
			if err = c.Store.Pool.QueryRow(ctx, "SELECT stop_deadline FROM job_attempts WHERE run_id=$1 AND number=$2", id, a.Number).Scan(&stopDeadline); err != nil {
				return err
			}
			if container.State.Status == "paused" {
				if _, err = deploy.Output(ctx, node, "docker", "unpause", a.Container); err != nil {
					return err
				}
			}
			if stopDeadline == nil {
				if _, err = c.Store.Pool.Exec(ctx, "UPDATE job_attempts SET stop_deadline=now()+make_interval(secs=>$3) WHERE run_id=$1 AND number=$2", id, a.Number, grace); err != nil {
					return err
				}
				signal := container.Config.StopSignal
				if signal == "" {
					signal = "SIGTERM"
				}
				_, err = deploy.Output(ctx, node, "docker", "kill", "--signal", signal, a.Container)
				return err
			}
			if !time.Now().Before(*stopDeadline) {
				_, err = deploy.Output(ctx, node, "docker", "kill", "--signal", "SIGKILL", a.Container)
				return err
			}
			return nil
		}
		return c.captureJobLogs(ctx, engine, release, run, a, false)
	}
	if container.State.Status != "exited" && container.State.Status != "dead" {
		return errors.New("unrecognized Job container state")
	}
	outcome := "failed"
	exit := container.State.ExitCode
	if exit == 0 {
		outcome = "succeeded"
	}
	if a.State == "timing_out" {
		outcome = "timed_out"
	}
	if run.State == "cancelling" || a.State == "cancelling" {
		outcome = "cancelled"
	}
	if err = c.captureJobLogs(ctx, engine, release, run, a, true); err != nil {
		return err
	}
	return c.finishJobAttempt(ctx, run, a, outcome, &exit)
}
func (c *Controller) finishJobAttempt(ctx context.Context, r model.JobRun, a model.JobAttempt, state string, exit *int) error {
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var current string
	if err = tx.QueryRow(ctx, "SELECT state FROM job_runs WHERE id=$1 FOR UPDATE", r.ID).Scan(&current); err != nil {
		return err
	}
	if current == "cancelling" {
		state = "cancelled"
	}
	if _, err = tx.Exec(ctx, "UPDATE job_attempts SET state=$3,exit_code=$4,finished_at=now() WHERE run_id=$1 AND number=$2", r.ID, a.Number, state, exit); err != nil {
		return err
	}
	// Unknown disappearance is not a confirmed workload failure and must never trigger retries.
	if exit != nil && (state == "failed" || state == "timed_out") && a.Number <= r.Policy.Retries {
		_, err = tx.Exec(ctx, "UPDATE job_runs SET state='retry_wait',retry_at=now()+make_interval(secs=>$2),error='' WHERE id=$1", r.ID, r.Policy.RetryDelaySeconds)
	} else {
		_, err = tx.Exec(ctx, "UPDATE job_runs SET state=$2,finished_at=now(),retry_at=NULL,error=$3 WHERE id=$1", r.ID, state, func() string {
			if exit == nil && state == "failed" {
				return "Container disappeared; execution outcome is unknown"
			}
			return ""
		}())
	}
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (c *Controller) finishJobRun(ctx context.Context, r model.JobRun, state, msg string) error {
	_, err := c.Store.Pool.Exec(ctx, "UPDATE job_runs SET state=$2,error=$3,finished_at=now(),cleanup_pending=true WHERE id=$1", r.ID, state, msg)
	return err
}
func (c *Controller) captureJobLogs(ctx context.Context, e *deploy.Engine, release model.Release, r model.JobRun, a model.JobAttempt, final bool) error {
	if a.LogsComplete {
		return nil
	}
	raw, err := e.JobLogs(ctx, a)
	if err != nil {
		return err
	}
	truncated := len(raw) > 1<<20
	if truncated {
		raw = raw[:1<<20]
	}
	lines := strings.SplitAfter(raw, "\n")
	if (!final || truncated) && len(lines) > 0 {
		lines = lines[:len(lines)-1]
	}
	redactor := deploymentLog{}
	for _, v := range release.Env {
		redactor.secrets = append(redactor.secrets, v)
	}
	var sealed []byte
	if err = c.Store.Pool.QueryRow(ctx, "SELECT snapshot FROM deployments WHERE id=$1", release.DeploymentID).Scan(&sealed); err != nil {
		return err
	}
	b, err := c.Store.Vault.Open(sealed, "deployment:"+release.DeploymentID)
	if err != nil {
		return err
	}
	var snapshot DeploymentSnapshot
	if err = json.Unmarshal(b, &snapshot); err != nil {
		return err
	}
	redactor.secrets = append(redactor.secrets, snapshot.SecretValues...)
	for _, secret := range append([]string{}, redactor.secrets...) {
		redactor.secrets = append(redactor.secrets, strings.Split(secret, "\n")...)
	}
	sort.Slice(redactor.secrets, func(i, j int) bool { return len(redactor.secrets[i]) > len(redactor.secrets[j]) })
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	end := len(lines)
	if end > a.LogLines+500 {
		end = a.LogLines + 500
	}
	more := end < len(lines)
	for i := a.LogLines; i < end; i++ {
		line := lines[i]
		if line == "" {
			continue
		}
		line = redactor.redact(line)
		if len(line) > 16384 {
			line = line[:16384] + " [line truncated]"
		}
		if _, err = tx.Exec(ctx, "INSERT INTO job_run_events(run_id,attempt,message) VALUES($1,$2,$3)", r.ID, a.Number, line); err != nil {
			return err
		}
	}
	if truncated && !more {
		if _, err = tx.Exec(ctx, "INSERT INTO job_run_events(run_id,attempt,message) VALUES($1,$2,'[Logs truncated at 1 MiB]')", r.ID, a.Number); err != nil {
			return err
		}
	}
	_, err = tx.Exec(ctx, "UPDATE job_attempts SET log_bytes=$3,log_lines=$4,logs_complete=$5 WHERE run_id=$1 AND number=$2", r.ID, a.Number, len(raw), end, !more && (final || truncated))
	if err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	if more {
		return errJobLogPending
	}
	return nil
}
func (c *Controller) cleanupJobAttempt(ctx context.Context, e *deploy.Engine, release model.Release, r model.JobRun, a model.JobAttempt) error {
	if err := e.FenceJob(ctx, release, a); err != nil {
		return err
	}
	container, err := e.InspectJob(ctx, a)
	if err != nil {
		return err
	}
	if container != nil {
		if container.Config.Labels["shipyard.run"] != r.ID || container.Config.Labels["shipyard.app"] != r.AppID {
			return errors.New("Job container ownership mismatch during cleanup")
		}
		if container.State.Status == "running" || container.State.Status == "restarting" || container.State.Status == "paused" {
			return errors.New("Job container has not stopped")
		}
		if err = c.captureJobLogs(ctx, e, release, r, a, true); err != nil {
			return err
		}
		if _, err = deploy.Output(ctx, e.Remote, "docker", "rm", "-v", a.Container); err != nil {
			return err
		}
	}
	if err = e.CleanupJob(ctx, release, a); err != nil {
		return err
	}
	_, err = c.Store.Pool.Exec(ctx, "UPDATE job_attempts SET cleaned=true WHERE run_id=$1 AND number=$2", r.ID, a.Number)
	return err
}
func (c *Controller) notifyJobRun(ctx context.Context, resource model.Resource, r model.JobRun) error {
	if r.State != "succeeded" && r.State != "failed" && r.State != "timed_out" {
		return nil
	}
	if err := c.Emit(ctx, "job."+r.State, resource.TeamID, resource.ID, map[string]any{"runId": r.ID, "releaseId": r.ReleaseID, "state": r.State}); err != nil {
		return err
	}
	_, err := c.Store.Pool.Exec(ctx, "UPDATE job_runs SET notified=true WHERE id=$1", r.ID)
	return err
}

// cancelApplicationJobs is called under the application lock by deletion workers.
func (c *Controller) cancelApplicationJobs(ctx context.Context, app string) error {
	rows, err := c.Store.Pool.Query(ctx, "SELECT id FROM job_runs WHERE app_id=$1 AND (state IN "+db.ActiveJobStates+" OR cleanup_pending)", app)
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
	for _, id := range ids {
		unlock, err := c.lock(ctx, "job-run:"+id)
		if err != nil {
			return err
		}
		if err = c.Store.CancelJobRun(ctx, app, id); err != nil {
			unlock()
			return err
		}
		if err = c.reconcileJob(ctx, app, id); err != nil {
			unlock()
			return err
		}
		unlock()
	}
	var busy bool
	if err = c.Store.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM job_runs WHERE app_id=$1 AND (state IN "+db.ActiveJobStates+" OR cleanup_pending))", app).Scan(&busy); err != nil {
		return err
	}
	if busy {
		return errors.New("waiting for Job cancellation and cleanup")
	}
	return nil
}
