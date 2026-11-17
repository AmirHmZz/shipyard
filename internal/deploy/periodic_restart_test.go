package deploy

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"strings"
	"testing"
	"time"
)

type restartIsolationExecutor struct {
	containers []container
	restarted  []string
	cancel     context.CancelFunc
}

func (n *restartIsolationExecutor) Close() error { return nil }
func (n *restartIsolationExecutor) Run(_ context.Context, command string, _ io.Reader, _ io.Writer) error {
	command = strings.ReplaceAll(command, "'\"'\"'", "'")
	if !strings.Contains(command, "Restart outcome is uncertain") {
		return nil
	}
	for i := range n.containers {
		c := &n.containers[i]
		if !strings.Contains(command, remote.Command("docker", "restart", c.ID)) {
			continue
		}
		n.restarted = append(n.restarted, c.ID)
		if n.cancel != nil {
			n.cancel()
			return context.Canceled
		}
		if c.ID == "blocked" {
			return errors.New("Restart outcome is uncertain")
		}
		c.State.StartedAt = time.Date(2026, 1, 1, 0, 10, 0, 0, time.UTC).Format(time.RFC3339Nano)
		return nil
	}
	return errors.New("unrecognized restart command")
}
func (n *restartIsolationExecutor) RunSeparated(_ context.Context, command string, _ io.Reader, stdout, _ io.Writer) error {
	if strings.Contains(command, "'ps'") {
		_, err := io.WriteString(stdout, "blocked replica worker stopped foreign")
		return err
	}
	for _, c := range n.containers {
		if command == remote.Command("docker", "inspect", c.ID) {
			return json.NewEncoder(stdout).Encode([]container{c})
		}
	}
	return json.NewEncoder(stdout).Encode(n.containers)
}

func restartIsolationFixture() (*restartIsolationExecutor, model.Release, []model.RestartPolicy, time.Time) {
	node := &restartIsolationExecutor{}
	for _, item := range []struct{ id, service, state string }{{"blocked", "api", "running"}, {"replica", "api", "running"}, {"worker", "worker", "running"}, {"stopped", "worker", "exited"}, {"foreign", "worker", "running"}} {
		c := container{ID: item.id}
		c.Config.Labels = map[string]string{"com.docker.compose.service": item.service, "shipyard.app": "app", "shipyard.release": "v1"}
		if item.id == "foreign" {
			c.Config.Labels["shipyard.release"] = "old"
		}
		c.State.Status = item.state
		c.State.StartedAt = "2026-01-01T00:00:00Z"
		node.containers = append(node.containers, c)
	}
	return node, model.Release{AppID: "app", ID: "v1", Directory: "/release"}, []model.RestartPolicy{{Service: "api", Enabled: true, IntervalSeconds: 60}, {Service: "worker", Enabled: true, IntervalSeconds: 60}}, time.Date(2026, 1, 1, 0, 10, 0, 0, time.UTC)
}

func TestPeriodicRestartContinuesAfterUncertainReplica(t *testing.T) {
	node, release, policies, now := restartIsolationFixture()
	engine := Engine{Remote: node}
	for range 2 {
		statuses, changed, err := engine.RestartDue(context.Background(), release, policies, 1, now)
		if err == nil || !strings.Contains(err.Error(), "service api container blocked") || len(statuses) != 4 {
			t.Fatal(statuses, changed, err)
		}
		if statuses[0].State != "error" || statuses[1].State != "running" || statuses[2].State != "running" || statuses[3].State != "exited" {
			t.Fatal(statuses)
		}
		if statuses[1].NextDue == nil || !statuses[1].NextDue.Equal(now.Add(time.Minute)) {
			t.Fatal(statuses[1])
		}
	}
	if strings.Join(node.restarted, ",") != "blocked,replica,worker,blocked" {
		t.Fatal(node.restarted)
	}
}

func TestPeriodicRestartStopsOnCancellation(t *testing.T) {
	node, release, policies, now := restartIsolationFixture()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	node.cancel = cancel
	statuses, _, err := (&Engine{Remote: node}).RestartDue(ctx, release, policies, 1, now)
	if !errors.Is(err, context.Canceled) || len(statuses) != 1 || len(node.restarted) != 1 {
		t.Fatal(statuses, node.restarted, err)
	}
}
