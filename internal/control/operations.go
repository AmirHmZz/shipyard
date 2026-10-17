package control

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"shipyard/internal/db"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/remote"
)

type Metric struct {
	ResourceID string            `json:"resourceId"`
	CPU        float64           `json:"cpu"`
	Memory     float64           `json:"memory"`
	Disk       float64           `json:"disk"`
	Online     bool              `json:"online"`
	Containers []ContainerMetric `json:"containers"`
	At         time.Time         `json:"at"`
}
type ContainerMetric struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	CPU    float64 `json:"cpu"`
	Memory float64 `json:"memory"`
}

func percent(v string) float64 {
	f, _ := strconv.ParseFloat(strings.TrimSuffix(strings.TrimSpace(v), "%"), 64)
	return f
}
func (c *Controller) metrics(ctx context.Context, id string) error {
	m := Metric{ResourceID: id, At: time.Now(), Containers: []ContainerMetric{}}
	client, _, e := c.connect(ctx, id)
	if e == nil {
		defer client.Close()
		m.Online = true
		script := `set -eu
awk '/^cpu /{print $2+$4, $2+$3+$4+$5+$6+$7+$8}' /proc/stat
awk '/MemTotal/{total=$2} /MemAvailable/{avail=$2} END{print (total-avail)/total*100}' /proc/meminfo
df -P /var/lib/docker | awk 'NR==2 {print $5}'
docker stats --no-stream --format '{{json .}}'
`
		var b bytes.Buffer
		if id == LocalServerID {
			script = strings.ReplaceAll(script, "df -P /var/lib/docker", "df -P /host/docker-root")
		}
		e = client.Run(ctx, remote.Command("sh", "-c", script), nil, &b)
		if e == nil {
			lines := strings.Split(strings.TrimSpace(b.String()), "\n")
			if len(lines) >= 3 {
				var used, total float64
				_, _ = fmt.Sscan(lines[0], &used, &total)
				if total > 0 {
					m.CPU = used / total * 100
				}
				m.Memory = percent(lines[1])
				m.Disk = percent(lines[2])
				for _, line := range lines[3:] {
					var stat struct {
						ID      string
						Name    string
						CPUPerc string
						MemPerc string
					}
					if json.Unmarshal([]byte(line), &stat) == nil {
						m.Containers = append(m.Containers, ContainerMetric{stat.ID, stat.Name, percent(stat.CPUPerc), percent(stat.MemPerc)})
					}
				}
			}
		} else {
			m.Online = false
		}
	}
	// Convert host CPU counters to an interval percentage instead of lifetime utilization.
	if m.Online {
		var counter string
		counter, e = deploy.Output(ctx, client, "sh", "-c", `awk '/^cpu /{print $2+$3+$4+$6+$7+$8,$2+$3+$4+$5+$6+$7+$8}' /proc/stat`)
		if e == nil {
			var used, total float64
			_, _ = fmt.Sscan(counter, &used, &total)
			var prev struct {
				Used  float64 `json:"used"`
				Total float64 `json:"total"`
			}
			var raw []byte
			_ = c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", "cpu:"+id).Scan(&raw)
			_ = json.Unmarshal(raw, &prev)
			if total > prev.Total && prev.Total > 0 {
				m.CPU = (used - prev.Used) / (total - prev.Total) * 100
			}
			raw, _ = json.Marshal(map[string]float64{"used": used, "total": total})
			_, _ = c.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", "cpu:"+id, raw)
		}
	}
	b, _ := json.Marshal(m)
	if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO metrics(resource_id,data) VALUES($1,$2)", id, b); err != nil {
		return err
	}
	rows, err := c.Store.Pool.Query(ctx, "SELECT r.id FROM resources r JOIN app_runtime a ON a.app_id=r.id WHERE r.kind='application' AND r.data->>'serverId'=$1 AND a.status<>'removed'", id)
	if err != nil {
		return err
	}
	apps := []string{}
	for rows.Next() {
		var app string
		if rows.Scan(&app) == nil {
			apps = append(apps, app)
		}
	}
	rows.Close()
	for _, app := range apps {
		err = func() error {
			unlock, acquired, lockErr := c.tryLock(ctx, "application:"+app)
			if lockErr != nil {
				return lockErr
			}
			if !acquired {
				return nil
			}
			defer unlock()
			release, err := c.Store.Active(ctx, app)
			if err != nil {
				return err
			}
			if m.Online && client != nil {
				var status string
				_ = c.Store.Pool.QueryRow(ctx, "SELECT status FROM app_runtime WHERE app_id=$1", app).Scan(&status)
				if status == "running" || status == "network_error" {
					before, _ := json.Marshal(release.Targets)
					engine := deploy.Engine{Remote: client, Log: io.Discard}
					if err = engine.Discover(ctx, &release); err != nil {
						_, _ = c.Store.Pool.Exec(ctx, "UPDATE app_runtime SET status='network_error' WHERE app_id=$1", app)
						if status != "network_error" {
							_ = c.Store.Enqueue(ctx, "proxy", id, "network-error:"+db.NowID(), nil)
						}
					} else {
						after, _ := json.Marshal(release.Targets)
						if string(before) != string(after) || status == "network_error" {
							if err = c.Store.UpdateRuntime(ctx, release); err != nil {
								return err
							}
							_, _ = c.Store.Pool.Exec(ctx, "UPDATE app_runtime SET status='running' WHERE app_id=$1", app)
							_ = c.Store.Enqueue(ctx, "proxy", id, "network-reconciled:"+db.NowID(), nil)
						}
					}
				}
			}
			point := applicationMetric(m, release)
			raw, _ := json.Marshal(point)
			if _, err = c.Store.Pool.Exec(ctx, "INSERT INTO metrics(resource_id,data) VALUES($1,$2)", app, raw); err != nil {
				return err
			}
			return nil
		}()
		if err != nil {
			return err
		}
	}
	policy := c.AlertPolicy(ctx)
	_ = c.alert(ctx, id, "server.offline", !m.Online, time.Duration(policy.OfflineSeconds)*time.Second, map[string]any{"serverId": id})
	if m.Online {
		_ = c.alert(ctx, id, "resource.high", m.CPU >= policy.CPU || m.Memory >= policy.Memory || m.Disk >= policy.Disk, policy.sustained(), m)
	}
	return nil
}

func applicationMetric(server Metric, release model.Release) Metric {
	point := Metric{ResourceID: release.AppID, At: server.At, Online: server.Online, Containers: []ContainerMetric{}}
	for _, stat := range server.Containers {
		for _, id := range release.Containers {
			if len(stat.ID) >= 12 && strings.HasPrefix(id, stat.ID) {
				point.Containers = append(point.Containers, stat)
				point.CPU += stat.CPU
				point.Memory += stat.Memory
				break
			}
		}
	}
	if len(point.Containers) > 0 {
		point.Memory /= float64(len(point.Containers))
	}
	return point
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
func (c *Controller) notify(ctx context.Context, j model.Job) error {
	var payload map[string]any
	if e := json.Unmarshal(j.Payload, &payload); e != nil {
		return e
	}
	if payload["marker"] == true {
		return nil
	}
	hookID, _ := payload["hookId"].(string)
	hook, e := c.Store.Resource(ctx, hookID)
	if e != nil {
		return e
	}
	spec, e := model.Decode[model.Webhook](hook)
	if e != nil {
		return e
	}
	secrets, e := c.Store.Secrets(hook)
	if e != nil {
		return e
	}
	delete(payload, "hookId")
	body, e := json.Marshal(payload)
	if e != nil {
		return e
	}
	req, e := http.NewRequestWithContext(ctx, "POST", spec.URL, bytes.NewReader(body))
	if e != nil {
		return e
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Shipyard/0.1")
	if secret := secrets["signing_secret"]; secret != "" {
		h := hmac.New(sha256.New, []byte(secret))
		h.Write(body)
		req.Header.Set("X-Shipyard-Signature", "sha256="+hex.EncodeToString(h.Sum(nil)))
	}
	if id, ok := payload["id"].(string); ok {
		req.Header.Set("X-Shipyard-Delivery", id)
	}
	res, e := providers.HTTPClient().Do(req)
	if e != nil {
		return e
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("notification endpoint returned HTTP %d", res.StatusCode)
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<20))
	return nil
}
func (c *Controller) Action(ctx context.Context, app model.Resource, action string) error {
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
	r, e := c.Store.Active(ctx, app.ID)
	if e != nil {
		return e
	}
	client, _, e := c.connect(ctx, r.ServerID)
	if e != nil {
		return e
	}
	defer client.Close()
	engine := deploy.Engine{Remote: client, Log: io.Discard, PrepareNetworks: c.prepareNetworks, ValidateConfig: c.validateRenderedNetworks}
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
	_, e = c.Store.Pool.Exec(ctx, "UPDATE app_runtime SET status=$2,updated_at=now() WHERE app_id=$1", app.ID, status)
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
	r, e := c.Store.Active(ctx, id)
	if e != nil {
		return nil, e
	}
	var status string
	_ = c.Store.Pool.QueryRow(ctx, "SELECT status FROM app_runtime WHERE app_id=$1", id).Scan(&status)
	return map[string]any{"releaseId": r.ID, "commit": r.Commit, "status": status, "containers": r.Containers, "targets": r.Targets, "createdAt": r.CreatedAt}, nil
}

var ErrNotFound = errors.New("not found")
