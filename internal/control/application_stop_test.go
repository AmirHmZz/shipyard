package control

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

func TestStopCancelsQueuedDeploymentWithoutActiveRelease(t *testing.T) {
	c, _, app := actionsFixture(t)
	ctx := context.Background()
	d, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if err = c.QueueStop(ctx, app); err != nil {
		t.Fatal(err)
	}
	if err = c.QueueStop(ctx, app); err != nil {
		t.Fatal(err)
	}
	d, err = c.Store.Deployment(ctx, d.ID)
	if err != nil || d.State != "cancelled" {
		t.Fatal(d, err)
	}
	runtime, err := c.Runtime(ctx, app.ID)
	if err != nil || runtime["status"] != "stopping" || runtime["releaseId"] != nil {
		t.Fatal(runtime, err)
	}
	if err = c.deploymentFence(ctx, d.ID); !errors.Is(err, ErrApplicationStopped) {
		t.Fatal("stale worker not fenced", err)
	}
	if _, err = c.Queue(ctx, app, "", ""); !errors.Is(err, db.ErrConflict) {
		t.Fatal("resume allowed while stopping", err)
	}
	var count int
	if err = c.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE kind='application-stop' AND resource_id=$1", app.ID).Scan(&count); err != nil || count != 1 {
		t.Fatal("Stop not idempotent", count, err)
	}
	if _, err = c.Store.Pool.Exec(ctx, "UPDATE application_control SET status='stopped' WHERE app_id=$1", app.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = c.queue(ctx, app, "", "", "git:later"); !errors.Is(err, ErrAutoDeployPaused) {
		t.Fatal("automatic deployment resumed stopped app", err)
	}
	if _, err = c.Queue(ctx, app, "", ""); err != nil {
		t.Fatal("explicit deploy could not resume", err)
	}
	if err = c.deploymentFence(ctx, d.ID); !errors.Is(err, ErrApplicationStopped) {
		t.Fatal("resume revived old deployment", err)
	}
}

func TestStopCancelsRunningContextAndCannotActivateStaleRelease(t *testing.T) {
	c, _, app := actionsFixture(t)
	ctx := context.Background()
	r := actionRelease(t, c, app)
	if err := c.Store.Stage(ctx, r.ID, "deploying", "readiness", ""); err != nil {
		t.Fatal(err)
	}
	watch, stop := c.watchDeployment(ctx, r.ID)
	defer stop()
	if err := c.QueueStop(ctx, app); err != nil {
		t.Fatal(err)
	}
	select {
	case <-watch.Done():
		if !errors.Is(context.Cause(watch), ErrApplicationStopped) {
			t.Fatal(context.Cause(watch))
		}
	case <-time.After(3 * time.Second):
		t.Fatal("running deployment did not cancel promptly")
	}
	if err := c.Store.Activate(ctx, r); !errors.Is(err, ErrApplicationStopped) {
		t.Fatal("stale release activated", err)
	}
	// A new controller sees the same persisted intent after a process restart.
	restarted := &Controller{Store: c.Store}
	runtime, err := restarted.Runtime(ctx, app.ID)
	if err != nil || runtime["status"] != "stopping" {
		t.Fatal(runtime, err)
	}
}

func TestDeploymentRedactsSecretsAcrossWriteChunks(t *testing.T) {
	var lines []string
	log := &deploymentLog{secrets: []string{"long-secret"}, write: func(line string) { lines = append(lines, line) }}
	_, _ = log.Write([]byte("config long-"))
	_, _ = log.Write([]byte("secret\n"))
	log.Flush()
	if len(lines) != 1 || strings.Contains(lines[0], "long-secret") || !strings.Contains(lines[0], "[REDACTED]") {
		t.Fatal(lines)
	}
}

func TestStopFailureIsVisibleAndResumeInvalidatesItsRetry(t *testing.T) {
	c, _, app := actionsFixture(t)
	ctx := context.Background()
	c.DialNode = func(context.Context, model.Server, map[string]string) (remote.Node, error) {
		return nil, errors.New("fixture host offline")
	}
	if err := c.QueueStop(ctx, app); err != nil {
		t.Fatal(err)
	}
	if err := c.stopApplication(ctx, app.ID, 1); err == nil {
		t.Fatal("offline stop reported success")
	}
	runtime, err := c.Runtime(ctx, app.ID)
	if err != nil || runtime["status"] != "stop_failed" || !strings.Contains(runtime["error"].(string), "offline") {
		t.Fatal(runtime, err)
	}
	if _, err = c.Queue(ctx, app, "", ""); err != nil {
		t.Fatal("explicit resume failed", err)
	}
	if err = c.stopApplication(ctx, app.ID, 1); err != nil {
		t.Fatal("stale stop retry was not ignored", err)
	}
	var desired, status string
	if err = c.Store.Pool.QueryRow(ctx, "SELECT desired_state,status FROM application_control WHERE app_id=$1", app.ID).Scan(&desired, &status); err != nil || desired != "running" || status != "running" {
		t.Fatal("stale stop changed resumed app", desired, status, err)
	}
}

func TestStopAttemptsCurrentAndRetainedServersWhenOneIsOffline(t *testing.T) {
	c, current, app := actionsFixture(t)
	ctx := context.Background()
	raw, _ := json.Marshal(model.Server{Host: "current"})
	if _, err := c.Store.Save(ctx, current.ID, model.ResourceInput{Kind: current.Kind, Name: current.Name, Version: current.Version, Data: raw}); err != nil {
		t.Fatal(err)
	}
	old := resource(t, c, "server", "", "", model.Server{Host: "retained"}, nil)
	d, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	r := model.Release{ID: d.ID, DeploymentID: d.ID, AppID: app.ID, ServerID: old.ID, App: model.App{Engine: "compose"}}
	if err = c.Store.SaveRelease(ctx, r); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	c.DialNode = func(_ context.Context, server model.Server, _ map[string]string) (remote.Node, error) {
		seen[server.Host] = true
		return nil, errors.New("fixture offline")
	}
	if err = c.QueueStop(ctx, app); err != nil {
		t.Fatal(err)
	}
	if err = c.stopApplication(ctx, app.ID, 1); err == nil {
		t.Fatal("offline hosts ignored")
	}
	if !seen["current"] || !seen["retained"] {
		t.Fatal("one failed host prevented stopping another", seen)
	}
}
