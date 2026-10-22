package control

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/remote"
	"strings"
	"testing"
	"time"
)

type jobLostStartNode struct {
	remote.Node
	lose *bool
}

type jobGitFixture struct {
	engine    string
	checkouts *int
}

func (jobGitFixture) Repositories(context.Context) ([]providers.Repository, error) { return nil, nil }
func (jobGitFixture) Branches(context.Context, string) ([]providers.Branch, error) { return nil, nil }
func (g jobGitFixture) Checkout(ctx context.Context, _, _, dir string) (string, error) {
	*g.checkouts++
	if err := os.WriteFile(filepath.Join(dir, "Dockerfile"), []byte("FROM busybox:1.37.0\nCMD [\"sh\",\"-c\",\"echo git-job-completed\"]\n"), 0600); err != nil {
		return "", err
	}
	if g.engine == "compose" {
		if err := os.WriteFile(filepath.Join(dir, "compose.yaml"), []byte("services:\n  task:\n    build: .\n    depends_on: [unused]\n  unused:\n    image: invalid.invalid/unused:latest\n"), 0600); err != nil {
			return "", err
		}
	}
	for _, args := range [][]string{{"init", "--quiet"}, {"config", "user.email", "jobs@shipyard.test"}, {"config", "user.name", "Jobs fixture"}, {"add", "."}, {"commit", "--quiet", "-m", "job"}} {
		command := exec.CommandContext(ctx, "git", args...)
		command.Dir = dir
		if out, err := command.CombinedOutput(); err != nil {
			return "", fmt.Errorf("fixture checkout: %w: %s", err, out)
		}
	}
	command := exec.CommandContext(ctx, "git", "rev-parse", "HEAD")
	command.Dir = dir
	out, err := command.Output()
	return strings.TrimSpace(string(out)), err
}
func TestLinuxGitJobsBuildEnginesAndRollback(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires isolated SSH/Docker fixture")
	}
	for _, engine := range []string{"dockerfile", "compose"} {
		t.Run(engine, func(t *testing.T) {
			c := testController(t)
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			host := os.Getenv("SHIPYARD_FIXTURE_HOST")
			key, err := os.ReadFile(os.Getenv("SHIPYARD_FIXTURE_PRIVATE_KEY_FILE"))
			if err != nil {
				t.Fatal(err)
			}
			fp, err := remote.Fingerprint(ctx, host, 2222)
			if err != nil {
				t.Fatal(err)
			}
			server := resource(t, c, "server", "", "", model.Server{Host: host, Port: 2222, User: "root", Fingerprint: fp}, map[string]string{"private_key": string(key)})
			team := resource(t, c, "team", "", "", map[string]any{}, nil)
			git := resource(t, c, "git", "", "", model.Git{Provider: "gitea", URL: "https://git.test.invalid"}, map[string]string{"token": "fixture-token"})
			for _, id := range []string{server.ID, git.ID} {
				if _, err = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", id, team.ID); err != nil {
					t.Fatal(err)
				}
			}
			file := "Dockerfile"
			if engine == "compose" {
				file = "compose.yaml"
			}
			count := 0
			c.GitFactory = func(model.Git, map[string]string) providers.GitProvider { return jobGitFixture{engine, &count} }
			spec := model.App{Workload: "job", Engine: engine, JobService: "task", ServerID: server.ID, GitID: git.ID, Repository: "fixture/job", Branch: "main", Context: ".", File: file, ReadinessMode: "container"}
			app := resource(t, c, "application", "", team.ID, spec, nil)
			prepare := func(rollback string) model.Release {
				t.Helper()
				d, e := c.Queue(ctx, app, "", rollback)
				if e != nil {
					t.Fatal(e)
				}
				if e = c.deploy(ctx, d.ID); e != nil {
					events, _ := c.Store.Events(ctx, d.ID, 0)
					t.Fatal(e, events)
				}
				r, e := c.Store.Active(ctx, app.ID)
				if e != nil {
					t.Fatal(e)
				}
				return r
			}
			first := prepare("")
			_ = prepare("")
			restored := prepare(first.ID)
			if count != 2 || restored.Images[spec.JobTarget()] != first.Images[spec.JobTarget()] {
				t.Fatal("rollback fetched or rebuilt", count, restored.Images)
			}
			node, _, err := c.connect(ctx, server.ID)
			if err != nil {
				t.Fatal(err)
			}
			tag := "shipyard/" + app.ID
			if engine == "compose" {
				tag += "-task"
			}
			pinned, err := deploy.Output(ctx, node, "docker", "image", "inspect", "--format", "{{.Id}}", tag+":"+restored.ID)
			node.Close()
			if err != nil || pinned != first.Images[spec.JobTarget()] {
				t.Fatal("rollback release image was not pinned", pinned, err)
			}
			run, err := c.Store.QueueJobRun(ctx, app.ID, "operator", "run")
			if err != nil {
				t.Fatal(err)
			}
			for range 40 {
				if err = c.reconcileJob(ctx, app.ID, run.ID); err != nil {
					t.Fatal(err)
				}
				run, err = c.Store.JobRun(ctx, app.ID, run.ID)
				if err != nil {
					t.Fatal(err)
				}
				if !run.Active() && !run.CleanupPending {
					break
				}
				time.Sleep(100 * time.Millisecond)
			}
			if run.State != "succeeded" {
				t.Fatal(run)
			}
			events, err := c.Store.JobEvents(ctx, run.ID, 0)
			if err != nil || len(events) == 0 || !strings.Contains(events[0].Message, "git-job-completed") {
				t.Fatal(events, err)
			}
		})
	}
}

func (n *jobLostStartNode) Run(ctx context.Context, command string, input io.Reader, output io.Writer) error {
	err := n.Node.Run(ctx, command, input, output)
	if err == nil && *n.lose && strings.Contains(command, "start-intent-") {
		*n.lose = false
		return errors.New("simulated lost SSH response after start")
	}
	return err
}
func (n *jobLostStartNode) RunSeparated(ctx context.Context, command string, input io.Reader, stdout, stderr io.Writer) error {
	err := n.Node.RunSeparated(ctx, command, input, stdout, stderr)
	if err == nil && *n.lose && strings.Contains(command, "start-intent-") {
		*n.lose = false
		return errors.New("simulated lost SSH response after start")
	}
	return err
}
func TestLinuxJobExecutionsRecoveryRetriesAndVersions(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires isolated SSH/Docker fixture")
	}
	c := testController(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	host := os.Getenv("SHIPYARD_FIXTURE_HOST")
	key, err := os.ReadFile(os.Getenv("SHIPYARD_FIXTURE_PRIVATE_KEY_FILE"))
	if err != nil {
		t.Fatal(err)
	}
	fp, err := remote.Fingerprint(ctx, host, 2222)
	if err != nil {
		t.Fatal(err)
	}
	server := resource(t, c, "server", "", "", model.Server{Host: host, Port: 2222, User: "root", Fingerprint: fp}, map[string]string{"private_key": string(key)})
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	if _, err = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", server.ID, team.ID); err != nil {
		t.Fatal(err)
	}
	spec := model.App{Source: "compose", Engine: "compose", Workload: "job", JobService: "task", ServerID: server.ID, Context: ".", File: "compose.yaml", ReadinessMode: "container"}
	network := resource(t, c, "network", server.ID, "", model.Network{ServerID: server.ID, Managed: true}, nil)
	if _, err = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", network.ID, team.ID); err != nil {
		t.Fatal(err)
	}
	if err = c.EnsureNetwork(ctx, network.ID); err != nil {
		t.Fatal(err)
	}
	spec.Networking = map[string]model.ServiceNetworking{"task": {Connections: []model.NetworkAttachment{{NetworkID: network.ID}}}}
	source := func(version, command string) string {
		return fmt.Sprintf("services:\n  task:\n    image: busybox:1.37.0\n    restart: always\n    command: [sh, -c, %q]\n    environment:\n      VERSION: %s\n    depends_on: [never]\n    volumes: [state:/state]\n  never:\n    image: invalid.invalid/never-pull:latest\nvolumes:\n  state: {}\n", command, version)
	}
	yaml := source("first", "echo $$TOKEN; echo $$VERSION >> /state/executions; if [ ! -f /state/retried ]; then touch /state/retried; exit 7; fi; cat /state/executions")
	app := resource(t, c, "application", "", team.ID, spec, map[string]string{"compose": yaml, "env:TOKEN": "job-private-token"})
	prepare := func() model.Release {
		t.Helper()
		d, e := c.Queue(ctx, app, "", "")
		if e != nil {
			t.Fatal(e)
		}
		if e = c.deploy(ctx, d.ID); e != nil {
			events, _ := c.Store.Events(ctx, d.ID, 0)
			t.Fatal(e, events)
		}
		r, e := c.Store.Active(ctx, app.ID)
		if e != nil {
			t.Fatal(e)
		}
		return r
	}
	first := prepare()
	node, _, err := c.connect(ctx, server.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer node.Close()
	if ids, e := deploy.Output(ctx, node, "docker", "ps", "-aq", "--filter", "label=shipyard.app="+app.ID); e != nil || ids != "" {
		t.Fatal("deployment executed Job", ids, e)
	}
	policy := model.DefaultJobSettings()
	policy.Retries = 1
	policy.RetryDelaySeconds = 1
	if _, err = c.Store.SaveJobSettings(ctx, app.ID, policy); err != nil {
		t.Fatal(err)
	}
	run, err := c.Store.QueueJobRun(ctx, app.ID, "operator", "first")
	if err != nil {
		t.Fatal(err)
	}
	lose := true
	c.DialNode = func(ctx context.Context, s model.Server, secrets map[string]string) (remote.Node, error) {
		n, e := remote.Dial(ctx, s, secrets["private_key"], secrets["password"])
		if e != nil {
			return nil, e
		}
		return &jobLostStartNode{n, &lose}, nil
	}
	if err = c.reconcileJob(ctx, app.ID, run.ID); err == nil {
		t.Fatal("lost start response was not injected")
	}
	if lose {
		t.Fatal("execution failed before the simulated lost start response")
	}
	// A fresh Controller recovers the started attempt instead of restarting it.
	recovered := &Controller{Store: c.Store, Logger: c.Logger, DataDir: c.DataDir}
	wait := func(id, state string) model.JobRun {
		t.Helper()
		until := time.Now().Add(40 * time.Second)
		for time.Now().Before(until) {
			if e := recovered.reconcileJob(ctx, app.ID, id); e != nil {
				t.Fatal(e)
			}
			r, e := c.Store.JobRun(ctx, app.ID, id)
			if e != nil {
				t.Fatal(e)
			}
			if r.State == state && (r.Active() || !r.CleanupPending) {
				return r
			}
			time.Sleep(100 * time.Millisecond)
		}
		r, _ := c.Store.JobRun(ctx, app.ID, id)
		t.Fatalf("waiting for %s: %#v", state, r)
		return r
	}
	_ = wait(run.ID, "retry_wait")
	// Updating policy and deploying a new version cannot change the retry's snapshot.
	current, _ := c.Store.JobSettings(ctx, app.ID)
	current.Retries = 0
	if _, err = c.Store.SaveJobSettings(ctx, app.ID, current); err != nil {
		t.Fatal(err)
	}
	app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: app.Version, Secrets: map[string]string{"compose": source("second", "echo $$VERSION >> /state/executions; cat /state/executions")}})
	if err != nil {
		t.Fatal(err)
	}
	second := prepare()
	if second.ID == first.ID {
		t.Fatal("release did not change")
	}
	completed := wait(run.ID, "succeeded")
	if len(completed.Attempts) != 2 || completed.ReleaseID != first.ID || completed.Policy.Retries != 1 {
		t.Fatal(completed)
	}
	events, err := c.Store.JobEvents(ctx, run.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	var logs strings.Builder
	for _, event := range events {
		logs.WriteString(event.Message)
	}
	if strings.Contains(logs.String(), "job-private-token") || !strings.Contains(logs.String(), "[REDACTED]") || strings.Contains(logs.String(), "second") {
		t.Fatal("logs or pinned retry changed", logs.String())
	}
	again, err := c.Store.QueueJobRun(ctx, app.ID, "operator", "again")
	if err != nil {
		t.Fatal(err)
	}
	if again.ReleaseID != second.ID || again.Policy.Retries != 0 {
		t.Fatal("Run again did not use current release/policy", again)
	}
	latest := wait(again.ID, "succeeded")
	if len(latest.Attempts) != 1 {
		t.Fatal(latest)
	}
	// The named volume survives across attempts and releases.
	latestEvents, _ := c.Store.JobEvents(ctx, again.ID, 0)
	logs.Reset()
	for _, event := range latestEvents {
		logs.WriteString(event.Message)
	}
	if strings.Count(logs.String(), "first") != 2 || !strings.Contains(logs.String(), "second") {
		t.Fatal("persistent state or at-most-once start failed", logs.String())
	}
	// A long-running attempt is cancelled durably even during maintenance.
	app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: app.Version, Secrets: map[string]string{"compose": source("long", "exec sleep 300")}})
	if err != nil {
		t.Fatal(err)
	}
	_ = prepare()
	long, err := c.Store.QueueJobRun(ctx, app.ID, "operator", "long")
	if err != nil {
		t.Fatal(err)
	}
	if err = recovered.reconcileJob(ctx, app.ID, long.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = c.Store.QueueJobRun(ctx, app.ID, "operator", "busy"); err == nil {
		t.Fatal("parallel run admitted")
	}
	_, _ = c.Store.Pool.Exec(ctx, "UPDATE settings SET value='true' WHERE key='maintenance'")
	if err = c.Store.CancelJobRun(ctx, app.ID, long.ID); err != nil {
		t.Fatal(err)
	}
	cancelled := wait(long.ID, "cancelled")
	if len(cancelled.Attempts) != 1 {
		t.Fatal(cancelled)
	}
	_, _ = c.Store.Pool.Exec(ctx, "UPDATE settings SET value='false' WHERE key='maintenance'")
	// Exercise timeout termination without waiting a full minute in the fixture.
	timed, err := c.Store.QueueJobRun(ctx, app.ID, "operator", "timeout")
	if err != nil {
		t.Fatal(err)
	}
	if err = recovered.reconcileJob(ctx, app.ID, timed.ID); err != nil {
		t.Fatal(err)
	}
	_, _ = c.Store.Pool.Exec(ctx, "UPDATE job_attempts SET deadline=now()-interval '1 second' WHERE run_id=$1", timed.ID)
	_ = wait(timed.ID, "timed_out")
	if ids, e := deploy.Output(ctx, node, "docker", "ps", "-aq", "--filter", "label=shipyard.app="+app.ID); e != nil || ids != "" {
		t.Fatal("attempt cleanup left containers", ids, e)
	}
	volumes, e := c.ApplicationVolumes(ctx, app)
	if e != nil || len(volumes.Volumes) != 1 {
		t.Fatal("Job volume attribution failed", volumes, e)
	}
}
