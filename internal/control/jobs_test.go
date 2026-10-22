package control

import (
	"context"
	"errors"
	"shipyard/internal/backup"
	"shipyard/internal/model"
	"testing"
)

func TestJobReleaseProtectionAndBackupDrain(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	server := resource(t, c, "server", "", "", model.Server{}, nil)
	if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", server.ID, team.ID); err != nil {
		t.Fatal(err)
	}
	spec := model.App{Workload: "job", Source: "compose", Engine: "compose", JobService: "task", ServerID: server.ID, Context: ".", File: "compose.yaml"}
	app := resource(t, c, "application", "", team.ID, spec, map[string]string{"compose": "services:\n  task:\n    image: busybox:1.37.0\n"})
	prepare := func() model.Release {
		t.Helper()
		d, err := c.Queue(ctx, app, "", "")
		if err != nil {
			t.Fatal(err)
		}
		r := model.Release{ID: d.ID, DeploymentID: d.ID, AppID: app.ID, ServerID: server.ID, App: spec}
		if err = c.Store.SaveRelease(ctx, r); err != nil {
			t.Fatal(err)
		}
		if err = c.Store.Activate(ctx, r); err != nil {
			t.Fatal(err)
		}
		return r
	}
	first := prepare()
	run, err := c.Store.QueueJobRun(ctx, app.ID, "operator", "first")
	if err != nil {
		t.Fatal(err)
	}
	_ = prepare()
	if _, err = c.QueueDeploymentDeletion(ctx, first.DeploymentID, "operator"); !errors.Is(err, ErrDeploymentProtected) {
		t.Fatal("running Job release could be deleted", err)
	}
	if _, err = backup.Export(ctx, c.Store, "invalid", "unused", "passphrase"); err == nil || err.Error() != "wait for running jobs to finish before exporting" {
		t.Fatal("backup ignored active Job", err)
	}
	if err = c.Store.CancelJobRun(ctx, app.ID, run.ID); err != nil {
		t.Fatal(err)
	}
	// A long deployment holds the application lock. Run reconciliation must still
	// make progress so deadlines and cancellation are independent of build time.
	conn, err := c.Store.Pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Release()
	if _, err = conn.Exec(ctx, "SELECT pg_advisory_lock(hashtextextended($1,0))", "application:"+app.ID); err != nil {
		t.Fatal(err)
	}
	job, err := c.Store.Claim(ctx, "job-lock-test", "job-reconcile")
	if err != nil {
		t.Fatal(err)
	}
	c.runJob(ctx, job, "job-lock-test")
	var state string
	if err = c.Store.Pool.QueryRow(ctx, "SELECT state FROM jobs WHERE id=$1", job.ID).Scan(&state); err != nil || state != "done" {
		t.Fatal("application deployment lock blocked reconciliation", state, err)
	}
	if _, err = conn.Exec(ctx, "SELECT pg_advisory_unlock(hashtextextended($1,0))", "application:"+app.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = c.QueueDeploymentDeletion(ctx, first.DeploymentID, "operator"); err != nil {
		t.Fatal("completed Job history unnecessarily protected release", err)
	}
	if _, err = c.QueueFresh(ctx, app, ""); err == nil {
		t.Fatal("Fresh deploy admitted for a Job")
	}
}
