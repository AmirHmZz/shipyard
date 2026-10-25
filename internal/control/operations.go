package control

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/db"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

type Metric struct {
	ResourceID       string            `json:"resourceId"`
	CPU              float64           `json:"cpu"`
	Memory           float64           `json:"memory"`
	Disk             float64           `json:"disk"`
	Online           bool              `json:"online"`
	At               time.Time         `json:"at"`
	Containers       []ContainerMetric `json:"containers"`
	Status           string            `json:"status,omitempty"`
	Valid            bool              `json:"valid"`
	CPUValid         bool              `json:"cpuValid"`
	MemoryBytes      uint64            `json:"memoryBytes"`
	MemoryTotalBytes uint64            `json:"memoryTotalBytes"`
	Network          []IORate          `json:"network"`
	Devices          []IORate          `json:"devices"`
	NetworkRx        *float64          `json:"networkRx"`
	NetworkTx        *float64          `json:"networkTx"`
	DiskRead         *float64          `json:"diskRead"`
	DiskWrite        *float64          `json:"diskWrite"`
	PeakCPU          *float64          `json:"peakCpu,omitempty"`
	PeakMemory       *float64          `json:"peakMemory,omitempty"`
	PeakDisk         *float64          `json:"peakDisk,omitempty"`
	Availability     *float64          `json:"availability,omitempty"`
	Samples          int               `json:"samples,omitempty"`
}
type ContainerMetric struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	CPU         float64  `json:"cpu"`
	Memory      float64  `json:"memory"`
	Valid       bool     `json:"valid"`
	CPUValid    bool     `json:"cpuValid"`
	MemoryBytes uint64   `json:"memoryBytes"`
	NetworkRx   *float64 `json:"networkRx"`
	NetworkTx   *float64 `json:"networkTx"`
	DiskRead    *float64 `json:"diskRead"`
	DiskWrite   *float64 `json:"diskWrite"`
}

func percent(v string) float64 {
	f, _ := strconv.ParseFloat(strings.TrimSuffix(strings.TrimSpace(v), "%"), 64)
	return f
}
func (c *Controller) metrics(ctx context.Context, id string) error {
	m, client := c.collectMetrics(ctx, id)
	if client != nil {
		defer client.Close()
	}
	if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO metrics(resource_id,data) VALUES($1,$2)", id, metricJSON(m)); err != nil {
		return err
	}
	server, err := c.Store.Resource(ctx, id)
	if err != nil {
		return err
	}
	if err = c.evaluateMonitoring(ctx, server, m); err != nil {
		return err
	}
	apps, err := c.Store.Resources(ctx, "application")
	if err != nil {
		return err
	}
	for _, resource := range apps {
		spec, err := model.Decode[model.App](resource)
		if err != nil {
			return err
		}
		if spec.ServerID != id || model.IsDeleting(resource) {
			continue
		}
		err = func() error {
			unlock, acquired, err := c.tryLock(ctx, "application:"+resource.ID)
			if err != nil || !acquired {
				return err
			}
			defer unlock()
			status := "not_deployed"
			ids := []string{}
			if spec.IsJob() {
				status = "idle"
				rows, err := c.Store.Pool.Query(ctx, "SELECT a.container FROM job_attempts a JOIN job_runs r ON r.id=a.run_id WHERE r.app_id=$1 AND r.state='running' AND a.state='running' AND NOT a.cleaned", resource.ID)
				if err != nil {
					return err
				}
				for rows.Next() {
					var container string
					if err = rows.Scan(&container); err != nil {
						rows.Close()
						return err
					}
					ids = append(ids, container)
				}
				err = rows.Err()
				rows.Close()
				if err != nil {
					return err
				}
				if len(ids) > 0 {
					status = "running"
				}
			} else {
				release, err := c.Store.Active(ctx, resource.ID)
				if err != nil && !errors.Is(err, pgx.ErrNoRows) {
					return err
				}
				if err == nil {
					ids = release.Containers
					if err = c.Store.Pool.QueryRow(ctx, "SELECT status FROM app_runtime WHERE app_id=$1", resource.ID).Scan(&status); err != nil {
						return err
					}
					var desired string
					_ = c.Store.Pool.QueryRow(ctx, "SELECT desired_state FROM application_control WHERE app_id=$1", resource.ID).Scan(&desired)
					if desired == "stopped" {
						status = "stopped"
					}
					if m.Online && client != nil && (status == "running" || status == "network_error") {
						before, _ := json.Marshal(release.Targets)
						engine := deploy.Engine{Remote: client, Log: io.Discard}
						if err = engine.Discover(ctx, &release); err != nil {
							_, _ = c.Store.Pool.Exec(ctx, "UPDATE app_runtime SET status='network_error' WHERE app_id=$1", resource.ID)
							if status != "network_error" {
								_ = c.Store.Enqueue(ctx, "proxy", id, "network-error:"+db.NowID(), nil)
							}
							status = "network_error"
						} else {
							after, _ := json.Marshal(release.Targets)
							if string(before) != string(after) || status == "network_error" {
								if err = c.Store.UpdateRuntime(ctx, release); err != nil {
									return err
								}
								_, _ = c.Store.Pool.Exec(ctx, "UPDATE app_runtime SET status='running' WHERE app_id=$1", resource.ID)
								_ = c.Store.Enqueue(ctx, "proxy", id, "network-reconciled:"+db.NowID(), nil)
							}
							status = "running"
						}
					}
				}
			}
			point := aggregateApplication(m, ids, resource.ID, status)
			if _, err = c.Store.Pool.Exec(ctx, "INSERT INTO metrics(resource_id,data) VALUES($1,$2)", resource.ID, metricJSON(point)); err != nil {
				return err
			}
			return c.evaluateMonitoring(ctx, resource, point)
		}()
		if err != nil {
			return err
		}
	}
	return nil
}

// Retained helper also protects legacy metric contract fixtures.
func applicationMetric(server Metric, release model.Release) Metric {
	return aggregateApplication(server, release.Containers, release.AppID, "running")
}
func (c *Controller) alert(ctx context.Context, id, kind string, active bool, duration time.Duration, data any) error {
	var current bool
	var since time.Time
	err := c.Store.Pool.QueryRow(ctx, "SELECT active,since FROM alert_state WHERE resource_id=$1 AND kind=$2", id, kind).Scan(&current, &since)
	if err != nil {
		_, err = c.Store.Pool.Exec(ctx, "INSERT INTO alert_state(resource_id,kind,active) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", id, kind, active)
		return err
	}
	if current != active {
		_, err = c.Store.Pool.Exec(ctx, "UPDATE alert_state SET active=$3,since=now() WHERE resource_id=$1 AND kind=$2", id, kind, active)
		if err != nil {
			return err
		}
		if !active && time.Since(since) >= duration {
			return c.emit(ctx, kind+".recovered", "", id, data, fmt.Sprintf("%s:%s:%d:recovered", id, kind, since.UnixNano()))
		}
		return nil
	}
	if active && time.Since(since) >= duration {
		return c.emit(ctx, kind, "", id, data, fmt.Sprintf("%s:%s:%d", id, kind, since.UnixNano()))
	}
	return nil
}
func (c *Controller) Emit(ctx context.Context, event, team, id string, data any) error {
	// The same deployment or certificate failure may be retried by a durable job.
	b, _ := json.Marshal(data)
	hash := sha256.Sum256(b)
	return c.emit(ctx, event, team, id, data, fmt.Sprintf("%s:%s:%x", event, id, hash))
}
func (c *Controller) emit(ctx context.Context, event, team, id string, data any, key string) error {
	hooks, e := c.Store.Resources(ctx, "webhook")
	if e != nil {
		return e
	}
	for _, hook := range hooks {
		if hook.TeamID != "" && hook.TeamID != team && !(team == "" && c.Store.TeamGranted(ctx, hook.TeamID, id)) {
			continue
		}
		spec, e := model.Decode[model.Webhook](hook)
		if e != nil {
			return e
		}
		matches := len(spec.Events) == 0
		for _, filter := range spec.Events {
			if filter == event || filter == "*" {
				matches = true
			}
		}
		if !matches {
			continue
		}
		payload := map[string]any{"id": uuid.NewSHA1(uuid.NameSpaceURL, []byte(hook.ID+":"+key)).String(), "event": event, "resourceId": id, "teamId": team, "at": time.Now(), "data": data, "hookId": hook.ID}
		if e = c.Store.Enqueue(ctx, "notify", hook.ID, "notification:"+payload["id"].(string), payload); e != nil {
			return e
		}
	}
	return nil
}
func (c *Controller) Action(ctx context.Context, app model.Resource, action string) error {
	spec, _ := model.Decode[model.App](app)
	if spec.IsJob() {
		return errors.New("use Run now or Cancel for Job applications")
	}
	if action != "start" && action != "stop" && action != "restart" {
		return errors.New("unsupported application action")
	}
	if action == "stop" {
		return c.QueueStop(ctx, app)
	}
	lock, e := c.Store.Pool.Acquire(ctx)
	if e != nil {
		return e
	}
	defer lock.Release()
	key := "application:" + app.ID
	if _, e = lock.Exec(ctx, "SELECT pg_advisory_lock(hashtextextended($1,0))", key); e != nil {
		return e
	}
	defer lock.Exec(context.WithoutCancel(ctx), "SELECT pg_advisory_unlock(hashtextextended($1,0))", key)
	current, err := c.Store.Resource(ctx, app.ID)
	if err != nil {
		return err
	}
	if model.IsDeleting(current) {
		return errors.New("Application deletion is in progress")
	}
	var freshBusy bool
	if e = c.Store.Pool.QueryRow(ctx, freshDeploymentBusySQL, app.ID, "").Scan(&freshBusy); e != nil {
		return e
	}
	if freshBusy {
		return errors.New("Fresh deploy recovery is still in progress")
	}
	r, e := c.Store.Active(ctx, app.ID)
	if e != nil {
		return e
	}
	if action == "start" {
		if e = c.resumeApplication(ctx, app.ID); e != nil {
			return e
		}
	}
	ctx, stopWatching, watchErr := c.watchApplication(ctx, app.ID)
	if watchErr != nil {
		return watchErr
	}
	defer stopWatching()
	client, _, e := c.connect(ctx, r.ServerID)
	if e != nil {
		return e
	}
	defer client.Close()
	engine := deploy.Engine{Remote: client, Log: io.Discard, Dial: client.DialContext, PrepareNetworks: c.prepareNetworks, ValidateConfig: c.validateRenderedNetworks}
	if action == "start" {
		e = engine.Start(ctx, &r)
		if e == nil {
			e = engine.Healthy(ctx, r)
		}
		if e == nil {
			e = c.Store.UpdateRuntime(ctx, r)
		}
	} else {
		e = engine.Action(ctx, r, action)
	}
	if e != nil {
		return e
	}
	status := "running"
	if action == "stop" {
		status = "stopped"
	}
	_, e = c.Store.Pool.Exec(ctx, "UPDATE app_runtime SET status=$2,updated_at=now() WHERE app_id=$1 AND NOT EXISTS(SELECT 1 FROM application_control WHERE app_id=$1 AND desired_state='stopped')", app.ID, status)
	if e != nil {
		return e
	}
	return c.syncProxy(ctx, r.ServerID, nil)
}
func (c *Controller) Client(ctx context.Context, app string) (remote.Node, model.Release, error) {
	r, e := c.Store.Active(ctx, app)
	if e != nil {
		return nil, r, e
	}
	client, _, e := c.connect(ctx, r.ServerID)
	return client, r, e
}
func ContainerAllowed(r model.Release, id string) bool {
	for _, container := range r.Containers {
		if container == id {
			return true
		}
	}
	return false
}
func (c *Controller) Runtime(ctx context.Context, id string) (map[string]any, error) {
	var desired, controlStatus, controlError string
	err := c.Store.Pool.QueryRow(ctx, "SELECT desired_state,status,error FROM application_control WHERE app_id=$1", id).Scan(&desired, &controlStatus, &controlError)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	r, e := c.Store.Active(ctx, id)
	if e != nil {
		if !errors.Is(e, pgx.ErrNoRows) {
			return nil, e
		}
		if controlStatus == "" || controlStatus == "running" {
			controlStatus = "not_deployed"
		}
		return map[string]any{"status": controlStatus, "error": controlError, "containers": []string{}, "targets": []model.Target{}}, nil
	}
	var status string
	_ = c.Store.Pool.QueryRow(ctx, "SELECT status FROM app_runtime WHERE app_id=$1", id).Scan(&status)
	if desired == "stopped" {
		status = controlStatus
	}
	return map[string]any{"releaseId": r.ID, "commit": r.Commit, "status": status, "error": controlError, "containers": r.Containers, "targets": r.Targets, "createdAt": r.CreatedAt}, nil
}

var ErrNotFound = errors.New("not found")
