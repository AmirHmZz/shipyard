package deploy

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

// All containers live inside the disposable SSH/Docker integration fixture.
func TestLinuxContainerReadinessPolicy(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires isolated SSH/Docker fixture")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
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
	t.Cleanup(func() { _ = node.Close() })
	if archive := os.Getenv("SHIPYARD_FIXTURE_IMAGE_ARCHIVE"); archive != "" {
		file, err := os.Open(archive)
		if err != nil {
			t.Fatal(err)
		}
		defer file.Close()
		if err = node.Run(ctx, remote.Command("docker", "load"), file, io.Discard); err != nil {
			t.Fatal(err)
		}
	}
	run := func(args ...string) string {
		t.Helper()
		out, err := Output(ctx, node, append([]string{"docker"}, args...)...)
		if err != nil {
			t.Fatal(err)
		}
		return out
	}
	r := model.Release{ID: uuid.NewString(), AppID: uuid.NewString(), App: model.App{Engine: "compose", ReadinessMode: "container"}, Compose: `{"services":{"worker":{"deploy":{"replicas":1}}}}`}
	engine := Engine{Remote: node, Dial: node.DialContext}
	create := func(action, service, replica string, extra ...string) string {
		t.Helper()
		args := []string{action, "--label", "com.docker.compose.project=" + Project(r), "--label", "com.docker.compose.service=" + service, "--label", "com.docker.compose.container-number=" + replica}
		args = append(args, extra...)
		id := run(args...)
		t.Cleanup(func() { _, _ = Output(context.Background(), node, "docker", "rm", "-f", id) })
		return id
	}
	check := func(wantSuccess bool) {
		t.Helper()
		timeout := 1500 * time.Millisecond
		if wantSuccess {
			timeout = 8 * time.Second
		}
		deadline, stop := context.WithTimeout(ctx, timeout)
		defer stop()
		err := engine.Healthy(deadline, r)
		if (err == nil) != wantSuccess {
			t.Fatalf("mode=%q expected success=%t: %v", r.App.ReadinessMode, wantSuccess, err)
		}
	}
	id := create("run", "worker", "1", "-d", "--health-cmd", "exit 1", "--health-interval", "1s", "--health-retries", "1", "busybox:1.37.0", "sleep", "300")
	for run("inspect", "--format", "{{.State.Health.Status}}", id) != "unhealthy" {
		select {
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		case <-time.After(100 * time.Millisecond):
		}
	}
	address := run("inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", id)
	r.Targets = []model.Target{{Service: "worker", Container: id, Address: address, Port: 8080}}
	check(true) // Running but unhealthy and not listening.
	r.App.ReadinessMode = "checks"
	check(false)
	r.App.ReadinessMode = ""
	check(false) // Legacy releases retain checked behavior.
	run("rm", "-f", id)
	id = create("create", "worker", "1", "busybox:1.37.0", "sleep", "300")
	r.App.ReadinessMode = "container"
	r.Targets = nil
	done := make(chan error, 1)
	go func() {
		time.Sleep(150 * time.Millisecond)
		_, err := Output(ctx, node, "docker", "start", id)
		done <- err
	}()
	check(true) // A created container must become running, with retries.
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	r.Targets = []model.Target{{Service: "worker", Address: run("inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", id), Port: 8080}}
	r.App.ReadinessMode = "checks"
	check(false) // No Docker health check: the routed TCP port still gates checks.
	r.App.ReadinessMode = "container"
	r.Targets = nil
	r.Compose = `{"services":{"worker":{"deploy":{"replicas":2}}}}`
	check(false)
	second := create("run", "worker", "2", "-d", "busybox:1.37.0", "sleep", "300")
	check(true)
	run("rm", "-f", id, second)
	r.Compose = `{"services":{"worker":{}}}`
	for _, code := range []int{0, 1} {
		id = create("run", "worker", "1", "-d", "busybox:1.37.0", "sh", "-c", fmt.Sprintf("exit %d", code))
		if got := run("wait", id); strings.TrimSpace(got) != fmt.Sprint(code) {
			t.Fatal(got)
		}
		check(code == 0)
		run("rm", "-f", id)
	}
}
