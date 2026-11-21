package control

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

type jobRegressionNode struct {
	remote.Node
	container *deploy.JobContainer
	logs      string
	fail      string
}

func (n *jobRegressionNode) Close() error { return nil }
func (n *jobRegressionNode) Run(ctx context.Context, command string, input io.Reader, output io.Writer) error {
	return n.RunSeparated(ctx, command, input, output, io.Discard)
}
func (n *jobRegressionNode) RunSeparated(_ context.Context, command string, _ io.Reader, stdout, _ io.Writer) error {
	if n.fail != "" && strings.Contains(command, n.fail) {
		return errors.New("simulated connection failure")
	}
	switch {
	case strings.Contains(command, "exec docker logs --timestamps"):
		_, err := io.WriteString(stdout, n.logs)
		return err
	case strings.Contains(command, "'ps'"):
		if n.container != nil {
			_, err := io.WriteString(stdout, n.container.ID)
			return err
		}
	case strings.Contains(command, "'inspect'"):
		return json.NewEncoder(stdout).Encode([]*deploy.JobContainer{n.container})
	}
	return nil
}

func jobRegressionFixture(t *testing.T) (*Controller, model.Resource, model.Release, model.JobRun) {
	t.Helper()
	c := testController(t)
	ctx := context.Background()
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	server := resource(t, c, "server", "", "", model.Server{}, nil)
	if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", server.ID, team.ID); err != nil {
		t.Fatal(err)
	}
	spec := model.App{Workload: "job", Source: "compose", Engine: "compose", JobService: "task", ServerID: server.ID, Context: ".", File: "compose.yaml"}
	app := resource(t, c, "application", "", team.ID, spec, map[string]string{"compose": "services:\n  task:\n    image: busybox:1.37.0\n"})
	d, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	release := model.Release{ID: d.ID, DeploymentID: d.ID, AppID: app.ID, ServerID: server.ID, App: spec, Directory: "/fixture"}
	if err = c.Store.SaveRelease(ctx, release); err != nil {
		t.Fatal(err)
	}
	if err = c.Store.Activate(ctx, release); err != nil {
		t.Fatal(err)
	}
	run, err := c.Store.QueueJobRun(ctx, app.ID, "operator", "test")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = c.Store.Pool.Exec(ctx, "INSERT INTO job_attempts(run_id,number,container,state,started_at,deadline) VALUES($1,1,$2,'starting',now(),now()+interval '10 minutes')", run.ID, "syjob-"+run.ID+"-1"); err != nil {
		t.Fatal(err)
	}
	if _, err = c.Store.Pool.Exec(ctx, "UPDATE job_runs SET state='running',cleanup_pending=true WHERE id=$1", run.ID); err != nil {
		t.Fatal(err)
	}
	run, err = c.Store.JobRun(ctx, app.ID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	return c, app, release, run
}

func TestJobLogsAcceptUnicodeAndResumeBatches(t *testing.T) {
	c, app, release, run := jobRegressionFixture(t)
	ctx := context.Background()
	release.Env = map[string]string{"TOKEN": "private-token"}
	// Place a three-byte character across the 16 KiB boundary.
	line := strings.Repeat("x", 16383) + "€" + "private-token" + "\x00\xff\n"
	node := &jobRegressionNode{logs: line + strings.Repeat("private-token\x00\xff\n", 501)}
	engine := &deploy.Engine{Remote: node}
	err := c.captureJobLogs(ctx, engine, release, run, run.Attempts[0], true)
	if !errors.Is(err, errJobLogPending) {
		t.Fatal(err)
	}
	current, err := c.Store.JobRun(ctx, app.ID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = c.captureJobLogs(ctx, engine, release, current, current.Attempts[0], true); err != nil {
		t.Fatal(err)
	}
	current, err = c.Store.JobRun(ctx, app.ID, run.ID)
	if err != nil || !current.Attempts[0].LogsComplete {
		t.Fatal(current, err)
	}
	if err = c.captureJobLogs(ctx, engine, release, current, current.Attempts[0], true); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = c.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM job_run_events WHERE run_id=$1", run.ID).Scan(&count); err != nil || count != 502 {
		t.Fatal(count, err)
	}
	events, err := c.Store.JobEvents(ctx, run.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(events[0].Message, " [line truncated]") {
		t.Fatal("missing line truncation marker")
	}
	for _, event := range events {
		if !utf8.ValidString(event.Message) || strings.ContainsAny(event.Message, "\x00") || strings.Contains(event.Message, "private-token") {
			t.Fatal("unsafe or unredacted log", event.ID)
		}
	}
	node.container = &deploy.JobContainer{ID: "container"}
	node.container.Config.Labels = map[string]string{"shipyard.app": app.ID, "shipyard.run": run.ID, "shipyard.release": release.ID, "shipyard.attempt": "1"}
	node.container.State.Status = "exited"
	node.container.State.StartedAt = time.Now().UTC().Format(time.RFC3339Nano)
	c.DialNode = func(context.Context, model.Server, map[string]string) (remote.Node, error) { return node, nil }
	for range 2 {
		if err = c.reconcileJob(ctx, app.ID, run.ID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = c.Store.QueueJobRun(ctx, app.ID, "operator", "next"); err != nil {
		t.Fatal("finished logs retained the execution slot", err)
	}
}

func TestExistingFinishedJobHistoryRequiresManualRepair(t *testing.T) {
	c, app, _, run := jobRegressionFixture(t)
	ctx := context.Background()
	if _, err := c.Store.Pool.Exec(ctx, "UPDATE job_runs SET state='failed',cleanup_pending=false,finished_at=now() WHERE id=$1", run.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Store.Pool.Exec(ctx, "UPDATE job_attempts SET cleaned=true WHERE run_id=$1", run.ID); err != nil {
		t.Fatal(err)
	}
	if err := c.reconcileJob(ctx, app.ID, run.ID); err != nil {
		t.Fatal(err)
	}
	current, err := c.Store.JobRun(ctx, app.ID, run.ID)
	if err != nil || current.Attempts[0].LogsComplete {
		t.Fatal(current, err)
	}
	events, err := c.Store.JobEvents(ctx, run.ID, 0)
	if err != nil || len(events) != 0 {
		t.Fatal(events, err)
	}
}

func TestJobLogCaptureKeepsItsByteLimit(t *testing.T) {
	c, app, release, run := jobRegressionFixture(t)
	ctx := context.Background()
	node := &jobRegressionNode{logs: strings.Repeat("x", (1<<20)-1) + "\noutput beyond the limit\n"}
	if err := c.captureJobLogs(ctx, &deploy.Engine{Remote: node}, release, run, run.Attempts[0], true); err != nil {
		t.Fatal(err)
	}
	current, err := c.Store.JobRun(ctx, app.ID, run.ID)
	if err != nil || !current.Attempts[0].LogsComplete || current.Attempts[0].LogBytes != 1<<20 {
		t.Fatal(current, err)
	}
	events, err := c.Store.JobEvents(ctx, run.ID, 0)
	if err != nil || len(events) != 2 || events[1].Message != "[Logs truncated at 1 MiB]" {
		t.Fatal(events, err)
	}
}

func TestJobExitPreservesTerminationIntentWithMissingTimestamp(t *testing.T) {
	for _, state := range []string{"timing_out", "cancelling"} {
		t.Run(state, func(t *testing.T) {
			c, app, release, run := jobRegressionFixture(t)
			ctx := context.Background()
			if _, err := c.Store.Pool.Exec(ctx, "UPDATE job_attempts SET state=$2,started_at=NULL WHERE run_id=$1", run.ID, state); err != nil {
				t.Fatal(err)
			}
			node := &jobRegressionNode{container: &deploy.JobContainer{ID: "container"}}
			node.container.Config.Labels = map[string]string{"shipyard.app": app.ID, "shipyard.run": run.ID, "shipyard.release": release.ID, "shipyard.attempt": "1"}
			node.container.State.Status = "exited"
			node.container.State.StartedAt = time.Now().UTC().Format(time.RFC3339Nano)
			c.DialNode = func(context.Context, model.Server, map[string]string) (remote.Node, error) { return node, nil }
			if err := c.reconcileJob(ctx, app.ID, run.ID); err != nil {
				t.Fatal(err)
			}
			current, err := c.Store.JobRun(ctx, app.ID, run.ID)
			expected := "timed_out"
			if state == "cancelling" {
				expected = "cancelled"
			}
			if err != nil || current.State != expected {
				t.Fatal(current, err)
			}
		})
	}
}

func TestJobStartingAttemptUsesConfirmedDockerStartAndDeadline(t *testing.T) {
	c, app, release, run := jobRegressionFixture(t)
	node := &jobRegressionNode{container: &deploy.JobContainer{ID: "container"}}
	node.container.Config.Labels = map[string]string{"shipyard.app": app.ID, "shipyard.run": run.ID, "shipyard.release": release.ID, "shipyard.attempt": "1"}
	node.container.State.Status = "running"
	start := time.Now().UTC().Add(-time.Minute).Truncate(time.Microsecond)
	node.container.State.StartedAt = start.Format(time.RFC3339Nano)
	c.DialNode = func(context.Context, model.Server, map[string]string) (remote.Node, error) { return node, nil }
	if err := c.reconcileJob(context.Background(), app.ID, run.ID); err != nil {
		t.Fatal(err)
	}
	current, err := c.Store.JobRun(context.Background(), app.ID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	attempt := current.Attempts[0]
	if attempt.State != "running" || !attempt.Deadline.Equal(start.Add(time.Duration(run.Policy.TimeoutSeconds)*time.Second)) || !attempt.StartedAt.Equal(start) {
		t.Fatal(attempt)
	}
	var visible int
	if err = c.Store.Pool.QueryRow(context.Background(), "SELECT count(*) FROM job_attempts a JOIN job_runs r ON r.id=a.run_id WHERE r.app_id=$1 AND r.state='running' AND a.state='running' AND NOT a.cleaned", app.ID).Scan(&visible); err != nil || visible != 1 {
		t.Fatal(visible, err)
	}
	node.container.State.Status = "exited"
	node.container.State.FinishedAt = attempt.Deadline.Add(time.Second).Format(time.RFC3339Nano)
	if err = c.reconcileJob(context.Background(), app.ID, run.ID); err != nil {
		t.Fatal(err)
	}
	current, err = c.Store.JobRun(context.Background(), app.ID, run.ID)
	if err != nil || current.State != "timed_out" {
		t.Fatalf("an exit after the deadline must time out even when observed after exit: %+v, %v", current, err)
	}
}

func TestMissingJobCleanupFinalizesLogsOnceAndAllowsDeletion(t *testing.T) {
	c, app, release, run := jobRegressionFixture(t)
	ctx := context.Background()
	node := &jobRegressionNode{fail: "'ps'"}
	engine := &deploy.Engine{Remote: node}
	if err := c.cleanupJobAttempt(ctx, engine, release, run, run.Attempts[0]); err == nil {
		t.Fatal("connection error accepted as absence")
	}
	current, err := c.Store.JobRun(ctx, app.ID, run.ID)
	if err != nil || current.Attempts[0].Cleaned || current.Attempts[0].LogsComplete {
		t.Fatal(current, err)
	}
	node.fail = ""
	if err = c.cleanupJobAttempt(ctx, engine, release, run, run.Attempts[0]); err != nil {
		t.Fatal(err)
	}
	if err = c.cleanupJobAttempt(ctx, engine, release, run, run.Attempts[0]); err != nil {
		t.Fatal(err)
	}
	current, err = c.Store.JobRun(ctx, app.ID, run.ID)
	if err != nil || !current.Attempts[0].Cleaned || !current.Attempts[0].LogsComplete {
		t.Fatal(current, err)
	}
	events, err := c.Store.JobEvents(ctx, run.ID, 0)
	if err != nil || len(events) != 1 || !strings.Contains(events[0].Message, "unavailable") {
		t.Fatal(events, err)
	}
	if _, err = c.Store.Pool.Exec(ctx, "UPDATE job_runs SET state='failed',cleanup_pending=false,finished_at=now() WHERE id=$1", run.ID); err != nil {
		t.Fatal(err)
	}
	if err = c.Store.DeleteJobRuns(ctx, app.ID, []string{run.ID}); err != nil {
		t.Fatal(err)
	}
}
