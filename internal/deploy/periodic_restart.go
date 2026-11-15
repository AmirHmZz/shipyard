package deploy

import (
	"context"
	"encoding/json"
	"fmt"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"strconv"
	"time"
)

type RestartStatus struct {
	Service   string     `json:"service"`
	Container string     `json:"container"`
	NextDue   *time.Time `json:"nextDue"`
	State     string     `json:"state"`
}

// RestartDue only restarts currently running replicas of the active release.
// A host-side claim prevents a lost SSH response from repeating a restart.
func (e *Engine) RestartDue(ctx context.Context, r model.Release, policies []model.RestartPolicy, version int64, now time.Time) ([]RestartStatus, bool, error) {
	containers, err := e.inspect(ctx, r)
	if err != nil {
		return nil, false, err
	}
	statuses := []RestartStatus{}
	changed := false
	for _, p := range policies {
		if !p.Enabled {
			continue
		}
		found := false
		for _, c := range containers {
			if c.Config.Labels["com.docker.compose.service"] != p.Service || c.Config.Labels["shipyard.app"] != r.AppID || c.Config.Labels["shipyard.release"] != r.ID || c.Config.Labels["com.docker.compose.oneoff"] == "True" {
				continue
			}
			found = true
			status := RestartStatus{Service: p.Service, Container: c.ID, State: c.State.Status}
			if c.State.Status == "running" {
				started, parseErr := time.Parse(time.RFC3339Nano, c.State.StartedAt)
				if parseErr != nil {
					return statuses, changed, parseErr
				}
				next := started.Add(time.Duration(p.IntervalSeconds) * time.Second)
				status.NextDue = &next
				if !next.After(now) {
					marker := r.Directory + "/restart-intent-" + c.ID + "-" + strconv.FormatInt(started.UnixNano(), 10) + "-" + strconv.FormatInt(version, 10)
					expected := "true " + c.State.StartedAt
					script := "set -eu; state=$(" + remote.Command("docker", "inspect", "--format", "{{.State.Running}} {{.State.StartedAt}}", c.ID) + "); if [ \"$state\" = " + remote.Quote(expected) + " ]; then if mkdir " + remote.Quote(marker) + " 2>/dev/null; then " + remote.Command("docker", "restart", c.ID) + "; else echo 'Restart outcome is uncertain; inspect the service and re-save its restart settings before retrying' >&2; exit 1; fi; fi"
					if err = e.command(ctx, "sh", "-c", script); err != nil {
						status.State = "error"
						statuses = append(statuses, status)
						return statuses, changed, err
					}
					changed = true
					out, inspectErr := Output(ctx, e.Remote, "docker", "inspect", c.ID)
					if inspectErr != nil {
						return statuses, changed, inspectErr
					}
					var refreshed []container
					if err = json.Unmarshal([]byte(out), &refreshed); err != nil {
						return statuses, changed, err
					}
					if len(refreshed) != 1 {
						return statuses, changed, fmt.Errorf("restart inspection returned no container")
					}
					status.State = refreshed[0].State.Status
					if refreshed[0].State.StartedAt != c.State.StartedAt {
						// The start timestamp now fences old retries; keep claims only
						// while their outcome is uncertain rather than growing forever.
						_ = e.command(ctx, "rmdir", marker)
					}
					if status.State == "running" {
						start, parseErr := time.Parse(time.RFC3339Nano, refreshed[0].State.StartedAt)
						if parseErr != nil {
							return statuses, changed, parseErr
						}
						next = start.Add(time.Duration(p.IntervalSeconds) * time.Second)
						status.NextDue = &next
					} else {
						status.NextDue = nil
					}
				}
			}
			statuses = append(statuses, status)
		}
		if !found {
			statuses = append(statuses, RestartStatus{Service: p.Service, State: "unavailable"})
		}
	}
	return statuses, changed, nil
}
