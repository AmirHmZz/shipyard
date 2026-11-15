package control

import (
	"context"
	"errors"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"testing"
	"time"
)

func TestAutomationCannotOverrideNewerManualControl(t *testing.T) {
	c, _, app := actionsFixture(t)
	ctx := context.Background()
	if err := c.Store.SaveAutomation(ctx, app.ID, model.DefaultAutomationSettings()); err != nil {
		t.Fatal(err)
	}
	_, err := c.Store.Pool.Exec(ctx, "INSERT INTO application_control(app_id) VALUES($1) ON CONFLICT DO NOTHING", app.ID)
	if err != nil {
		t.Fatal(err)
	}
	action := db.AutomationAction{ID: "scheduled", Version: 1, Action: "start"}
	_, err = c.Store.Pool.Exec(ctx, "UPDATE application_automation SET action_id=$2,action_result='queued',last_result='queued' WHERE app_id=$1", app.ID, action.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = c.QueueStop(ctx, app); err != nil {
		t.Fatal(err)
	}
	if err = c.runAutomation(ctx, app.ID, action); err != nil {
		t.Fatal(err)
	}
	var desired, result string
	if err = c.Store.Pool.QueryRow(ctx, "SELECT desired_state FROM application_control WHERE app_id=$1", app.ID).Scan(&desired); err != nil || desired != "stopped" {
		t.Fatal(desired, err)
	}
	status, err := c.Store.Automation(ctx, app.ID)
	if err != nil {
		t.Fatal(err)
	}
	result = status.LastResult
	if result != "skipped" {
		t.Fatal("stale action was not marked skipped", result)
	}
	// The transactional fence also closes the validation-to-resume race.
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if err = automationFence(ctx, tx, app.ID, action); !errors.Is(err, db.ErrConflict) {
		t.Fatal("stale action passed transactional fence", err)
	}
}

func TestScheduledResumeDoesNotBecomeAManualOverride(t *testing.T) {
	c, _, app := actionsFixture(t)
	ctx := context.Background()
	_, err := c.Store.Pool.Exec(ctx, "INSERT INTO application_control(app_id,desired_state,status,automation_generation) VALUES($1,'stopped','stopped',7)", app.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = c.resumeApplication(ctx, app.ID, false); err != nil {
		t.Fatal(err)
	}
	var generation int64
	var desired string
	if err = c.Store.Pool.QueryRow(ctx, "SELECT automation_generation,desired_state FROM application_control WHERE app_id=$1", app.ID).Scan(&generation, &desired); err != nil || generation != 7 || desired != "running" {
		t.Fatal(generation, desired, err)
	}
	if err = c.resumeApplication(ctx, app.ID, true); err != nil {
		t.Fatal(err)
	}
	if err = c.Store.Pool.QueryRow(ctx, "SELECT automation_generation FROM application_control WHERE app_id=$1", app.ID).Scan(&generation); err != nil || generation != 8 {
		t.Fatal(generation, err)
	}
}

func TestScheduledStopFencesDeploymentBeforeExecutionLock(t *testing.T) {
	c, _, app := actionsFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	d, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	p := model.DefaultAutomationSettings()
	p.Rules = []model.AutomationRule{{ID: "stop", Enabled: true, Action: "stop", Cron: "* * * * *", Timezone: "UTC"}}
	if err = c.Store.SaveAutomation(ctx, app.ID, p); err != nil {
		t.Fatal(err)
	}
	if err = c.Store.DispatchAutomation(ctx, app.ID, time.Now().Add(2*time.Minute)); err != nil {
		t.Fatal(err)
	}
	conn, err := c.Store.Pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Release()
	key := "application:" + app.ID
	if _, err = conn.Exec(ctx, "SELECT pg_advisory_lock(hashtextextended($1,0))", key); err != nil {
		t.Fatal(err)
	}
	defer conn.Exec(context.Background(), "SELECT pg_advisory_unlock(hashtextextended($1,0))", key)
	// A periodic restart completing must not erase a pending scheduled stop.
	if _, err = c.Store.Pool.Exec(ctx, "UPDATE application_automation SET last_action='restart',last_result='succeeded' WHERE app_id=$1", app.ID); err != nil {
		t.Fatal(err)
	}
	if err = c.requestScheduledStop(ctx, app.ID); err != nil {
		t.Fatal(err)
	}
	if err = c.deploymentFence(ctx, d.ID); !errors.Is(err, ErrApplicationStopped) {
		t.Fatal("scheduled stop waited behind deployment", err)
	}
}
