package deploy

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"shipyard/internal/model"
)

type policyExecutor struct {
	states []string
	health string
	calls  atomic.Int32
}

func (n *policyExecutor) Close() error { return nil }
func (n *policyExecutor) Run(ctx context.Context, command string, input io.Reader, output io.Writer) error {
	return n.RunSeparated(ctx, command, input, output, io.Discard)
}
func (n *policyExecutor) RunSeparated(_ context.Context, command string, _ io.Reader, output, _ io.Writer) error {
	if !strings.Contains(command, "'inspect'") {
		_, err := io.WriteString(output, "container-1\n")
		return err
	}
	index := int(n.calls.Add(1)) - 1
	if index >= len(n.states) {
		index = len(n.states) - 1
	}
	state := map[string]any{"Status": n.states[index], "ExitCode": 0}
	if n.states[index] == "failed" {
		state["Status"], state["ExitCode"] = "exited", 1
	}
	if n.health != "" {
		state["Health"] = map[string]string{"Status": n.health}
	}
	return json.NewEncoder(output).Encode([]any{map[string]any{"Id": "container-1", "Config": map[string]any{"Labels": map[string]string{"com.docker.compose.service": "app", "com.docker.compose.container-number": "1"}}, "State": state}})
}

func TestContainerPolicySkipsProbesAndDockerHealth(t *testing.T) {
	for _, mode := range []string{"container", "checks", ""} {
		t.Run(mode, func(t *testing.T) {
			node := &policyExecutor{states: []string{"running"}, health: "unhealthy"}
			var dials atomic.Int32
			engine := Engine{Remote: node, Dial: func(context.Context, string, string) (net.Conn, error) {
				dials.Add(1)
				return nil, errors.New("not listening yet")
			}}
			r := model.Release{App: model.App{ReadinessMode: mode}, Targets: []model.Target{{Service: "app", Address: "192.0.2.1", Port: 8080}}, Containers: []string{"container-1"}}
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Millisecond)
			defer cancel()
			err := engine.Healthy(ctx, r)
			if mode == "container" && (err != nil || dials.Load() != 0) {
				t.Fatal("container policy waited on readiness", err, dials.Load())
			}
			if mode != "container" && err == nil {
				t.Fatal("checked policy ignored Docker health")
			}
		})
	}
	// A running container without a Docker health check still needs its port in checks mode.
	for _, mode := range []string{"checks", ""} {
		var dials atomic.Int32
		engine := Engine{Remote: &policyExecutor{states: []string{"running"}}, Dial: func(context.Context, string, string) (net.Conn, error) {
			dials.Add(1)
			return nil, errors.New("booting")
		}}
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Millisecond)
		err := engine.Healthy(ctx, model.Release{App: model.App{ReadinessMode: mode}, Targets: []model.Target{{Address: "192.0.2.1", Port: 8080}}})
		cancel()
		if err == nil || dials.Load() == 0 {
			t.Fatal("checked policy skipped TCP", err, dials.Load())
		}
	}
}

func TestContainerPolicyWaitsForStartupAndRejectsFailures(t *testing.T) {
	node := &policyExecutor{states: []string{"created", "running"}}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	if err := (&Engine{Remote: node}).Healthy(ctx, model.Release{App: model.App{ReadinessMode: "container"}}); err != nil || node.calls.Load() < 2 {
		t.Fatal("did not wait for startup", err)
	}
	for _, state := range []string{"restarting", "dead", "failed"} {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
		err := (&Engine{Remote: &policyExecutor{states: []string{state}}}).Healthy(ctx, model.Release{App: model.App{ReadinessMode: "container"}})
		cancel()
		if err == nil {
			t.Fatal("failed container passed", state)
		}
	}
}

func TestContainerPolicyRequiresExpectedReplicasAndKeepsOneShots(t *testing.T) {
	r := model.Release{App: model.App{Engine: "compose", ReadinessMode: "container"}, Compose: `{"services":{"app":{"deploy":{"replicas":2}}}}`}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	err := (&Engine{Remote: &policyExecutor{states: []string{"running"}}}).Healthy(ctx, r)
	cancel()
	if err == nil || !strings.Contains(err.Error(), "expected containers") {
		t.Fatal("missing replica passed", err)
	}
	r.Compose = ""
	r.Containers = []string{"container-1", "missing"}
	ctx, cancel = context.WithTimeout(context.Background(), 30*time.Millisecond)
	err = (&Engine{Remote: &policyExecutor{states: []string{"running"}}}).Healthy(ctx, r)
	cancel()
	if err == nil {
		t.Fatal("missing saved container passed")
	}
	r.Containers = nil
	if err = (&Engine{Remote: &policyExecutor{states: []string{"exited"}}}).Healthy(context.Background(), r); err != nil {
		t.Fatal("successful one-shot failed", err)
	}
}
