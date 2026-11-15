package deploy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"os"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestLinuxServiceLimitsAndPeriodicRestart(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires isolated SSH/Docker fixture")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	host := os.Getenv("SHIPYARD_FIXTURE_HOST")
	key, err := os.ReadFile(os.Getenv("SHIPYARD_FIXTURE_PRIVATE_KEY_FILE"))
	if err != nil {
		t.Fatal(err)
	}
	fingerprint, err := remote.Fingerprint(ctx, host, 2222)
	if err != nil {
		t.Fatal(err)
	}
	node, err := remote.Dial(ctx, model.Server{Host: host, Port: 2222, User: "root", Fingerprint: fingerprint}, string(key), "")
	if err != nil {
		t.Fatal(err)
	}
	defer node.Close()
	run := func(args ...string) string {
		t.Helper()
		out, e := Output(ctx, node, args...)
		if e != nil {
			t.Fatal(e, out)
		}
		return strings.TrimSpace(out)
	}
	cpu := 0.5
	memory := int64(64 * 1024 * 1024)
	r := model.Release{ID: uuid.NewString(), AppID: uuid.NewString(), App: model.App{Engine: "compose"}, Images: map[string]string{}, Env: map[string]string{}}
	r.Directory = "/tmp/automation-" + r.ID
	cfg := map[string]any{"services": map[string]any{"app": map[string]any{"image": "busybox:1.37.0", "command": []string{"sleep", "600"}, "deploy": map[string]any{"replicas": 2}}}}
	if err = ApplyResourceLimits(cfg, map[string]model.ServiceLimits{"app": {CPUs: &cpu, MemoryBytes: &memory}}); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(cfg)
	r.Compose = string(raw)
	r.Images["app"] = run("docker", "image", "inspect", "--format", "{{.Id}}", "busybox:1.37.0")
	var logs bytes.Buffer
	engine := Engine{Remote: node, Log: &logs}
	run("mkdir", "-p", r.Directory)
	defer func() {
		_ = engine.Remove(context.Background(), r, false)
		_, _ = Output(context.Background(), node, "rm", "-rf", r.Directory)
	}()
	if err = engine.Start(ctx, &r); err != nil {
		t.Fatal(err, logs.String())
	}
	if len(r.Containers) != 2 {
		t.Fatal("missing replicas", r.Containers)
	}
	for _, id := range r.Containers {
		if limits := run("docker", "inspect", "--format", "{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}}", id); limits != "500000000 67108864" {
			t.Fatal("Docker did not enforce caps", limits)
		}
	}
	stopped, running := r.Containers[0], r.Containers[1]
	run("docker", "stop", "--time", "1", stopped)
	before := run("docker", "inspect", "--format", "{{.State.StartedAt}}", running)
	policies := []model.RestartPolicy{{Service: "app", Enabled: true, IntervalSeconds: 60}}
	statuses, changed, err := engine.RestartDue(ctx, r, policies, 1, time.Now().Add(2*time.Minute))
	if err != nil || !changed || len(statuses) != 2 {
		t.Fatal(statuses, changed, err)
	}
	if run("docker", "inspect", "--format", "{{.State.Running}}", stopped) != "false" {
		t.Fatal("periodic restart started a stopped replica")
	}
	after := run("docker", "inspect", "--format", "{{.State.StartedAt}}", running)
	if after == before {
		t.Fatal("running replica was not restarted")
	}
	if _, changed, err = engine.RestartDue(ctx, r, policies, 1, time.Now()); err != nil || changed {
		t.Fatal("interval did not reset", changed, err)
	}
	started, err := time.Parse(time.RFC3339Nano, after)
	if err != nil {
		t.Fatal(err)
	}
	marker := r.Directory + "/restart-intent-" + running + "-" + strconv.FormatInt(started.UnixNano(), 10) + "-1"
	run("mkdir", marker)
	if _, _, err = engine.RestartDue(ctx, r, policies, 1, time.Now().Add(2*time.Minute)); err == nil {
		t.Fatal("uncertain restart was repeated")
	}
	if run("docker", "inspect", "--format", "{{.State.StartedAt}}", running) != after {
		t.Fatal("claimed restart executed again")
	}
	// A new policy version deliberately resets an uncertain restart claim.
	if _, changed, err = engine.RestartDue(ctx, r, policies, 2, time.Now().Add(2*time.Minute)); err != nil || !changed {
		t.Fatal(fmt.Sprint("updated policy did not recover: ", err))
	}
	// New releases use their own limits; starting a retained release restores its
	// frozen Compose limits even if current application settings have changed.
	next := r
	next.ID = uuid.NewString()
	next.Directory = "/tmp/automation-" + next.ID
	run("mkdir", "-p", next.Directory)
	defer func() { _, _ = Output(context.Background(), node, "rm", "-rf", next.Directory) }()
	var nextConfig map[string]any
	if err = json.Unmarshal([]byte(r.Compose), &nextConfig); err != nil {
		t.Fatal(err)
	}
	otherCPU := 0.25
	if err = ApplyResourceLimits(nextConfig, map[string]model.ServiceLimits{"app": {CPUs: &otherCPU}}); err != nil {
		t.Fatal(err)
	}
	raw, _ = json.Marshal(nextConfig)
	next.Compose = string(raw)
	if err = engine.Start(ctx, &next); err != nil {
		t.Fatal(err, logs.String())
	}
	if got := run("docker", "inspect", "--format", "{{.HostConfig.NanoCpus}}", next.Containers[0]); got != "250000000" {
		t.Fatal(got)
	}
	if err = engine.Start(ctx, &r); err != nil {
		t.Fatal(err, logs.String())
	}
	if got := run("docker", "inspect", "--format", "{{.HostConfig.NanoCpus}}", r.Containers[0]); got != "500000000" {
		t.Fatal("rollback lost frozen limits", got)
	}
	// Dockerfile Jobs execute the same frozen cap configuration through their
	// separate one-off container creation path.
	job := r
	job.ID = uuid.NewString()
	job.App = model.App{Engine: "dockerfile", Workload: "job"}
	var jobConfig map[string]any
	if err = json.Unmarshal([]byte(r.Compose), &jobConfig); err != nil {
		t.Fatal(err)
	}
	delete(jobConfig["services"].(map[string]any)["app"].(map[string]any)["deploy"].(map[string]any), "replicas")
	raw, _ = json.Marshal(jobConfig)
	job.Compose = string(raw)
	attempt := model.JobAttempt{Number: 1, Container: "syjob-" + uuid.NewString()}
	defer func() {
		_, _ = Output(context.Background(), node, "docker", "compose", "-p", JobProject(attempt), "-f", JobFile(job, attempt), "down")
		_, _ = Output(context.Background(), node, "rm", "-f", JobFile(job, attempt))
	}()
	if err = engine.CreateJob(ctx, &job, model.JobRun{ID: uuid.NewString()}, attempt); err != nil {
		t.Fatal(err, logs.String())
	}
	if got := run("docker", "inspect", "--format", "{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}}", attempt.Container); got != "500000000 67108864" {
		t.Fatal("Job lost frozen limits", got)
	}
}
