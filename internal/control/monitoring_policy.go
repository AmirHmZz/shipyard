package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
)

type MonitoringPolicy struct {
	Enabled          bool     `json:"enabled"`
	CPU              float64  `json:"cpu"`
	Memory           float64  `json:"memory"`
	Disk             float64  `json:"disk"`
	SustainedSeconds int      `json:"sustainedSeconds"`
	OfflineSeconds   int      `json:"offlineSeconds"`
	Destinations     []string `json:"destinations"`
}
type MonitoringDefaults struct {
	Server      MonitoringPolicy `json:"server"`
	Application MonitoringPolicy `json:"application"`
}
type MonitoringPolicyState struct {
	Mode   string           `json:"mode"`
	Policy MonitoringPolicy `json:"policy"`
}
type MonitoringIncident struct {
	ID           string          `json:"id"`
	ResourceID   string          `json:"resourceId"`
	Kind         string          `json:"kind"`
	State        string          `json:"state"`
	Since        time.Time       `json:"since"`
	FiredAt      *time.Time      `json:"firedAt"`
	ResolvedAt   *time.Time      `json:"resolvedAt"`
	Destinations []string        `json:"destinations"`
	Data         json.RawMessage `json:"data"`
}

func (p MonitoringPolicy) Validate(kind string) error {
	max := 100.0
	if kind == "application" {
		max = 100000
	}
	if math.IsNaN(p.CPU) || math.IsInf(p.CPU, 0) || p.CPU < 1 || p.CPU > max || p.Memory < 1 || p.Memory > 100 || p.Disk < 1 || p.Disk > 100 {
		return errors.New("invalid resource threshold")
	}
	if p.SustainedSeconds < 30 || p.SustainedSeconds > 86400 || p.OfflineSeconds < 30 || p.OfflineSeconds > 86400 {
		return errors.New("alert durations must be 30–86400 seconds")
	}
	if len(p.Destinations) > 100 {
		return errors.New("select at most 100 notification destinations")
	}
	return nil
}
func (c *Controller) MonitoringDefaults(ctx context.Context) (MonitoringDefaults, error) {
	var out MonitoringDefaults
	var raw []byte
	err := c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key='monitoring-defaults'").Scan(&raw)
	if err != nil {
		return out, err
	}
	err = json.Unmarshal(raw, &out)
	return out, err
}
func (c *Controller) MonitoringPolicy(ctx context.Context, r model.Resource) (MonitoringPolicyState, error) {
	defaults, err := c.MonitoringDefaults(ctx)
	if err != nil {
		return MonitoringPolicyState{}, err
	}
	out := MonitoringPolicyState{Mode: "inherit", Policy: defaults.Server}
	if r.Kind == "application" {
		out.Policy = defaults.Application
	}
	var raw []byte
	err = c.Store.Pool.QueryRow(ctx, "SELECT data FROM monitoring_policies WHERE resource_id=$1", r.ID).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	err = json.Unmarshal(raw, &out)
	return out, err
}
func validateDestinations(ctx context.Context, tx pgx.Tx, p MonitoringPolicy) error {
	for _, id := range p.Destinations {
		var yes bool
		if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM resources WHERE id=$1 AND kind='webhook')", id).Scan(&yes); err != nil {
			return err
		}
		if !yes {
			return errors.New("selected notification integration is unavailable")
		}
	}
	return nil
}
func (c *Controller) SetMonitoringDefaults(ctx context.Context, v MonitoringDefaults) error {
	if err := v.Server.Validate("server"); err != nil {
		return err
	}
	if err := v.Application.Validate("application"); err != nil {
		return err
	}
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	for _, p := range []MonitoringPolicy{v.Server, v.Application} {
		if err = validateDestinations(ctx, tx, p); err != nil {
			return err
		}
	}
	if v.Server.Destinations == nil {
		v.Server.Destinations = []string{}
	}
	if v.Application.Destinations == nil {
		v.Application.Destinations = []string{}
	}
	raw, _ := json.Marshal(v)
	if _, err = tx.Exec(ctx, "UPDATE settings SET value=$1 WHERE key='monitoring-defaults'", raw); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "UPDATE monitoring_incidents SET state='resolved',resolved_at=now() WHERE state='pending' AND resource_id NOT IN(SELECT resource_id FROM monitoring_policies)"); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (c *Controller) SetMonitoringPolicy(ctx context.Context, r model.Resource, v MonitoringPolicyState) error {
	if v.Mode != "inherit" && v.Mode != "override" && v.Mode != "disabled" {
		return errors.New("select inherit, override or disabled")
	}
	if v.Mode == "override" {
		if err := v.Policy.Validate(r.Kind); err != nil {
			return err
		}
	}
	if v.Mode == "disabled" {
		current, err := c.MonitoringPolicy(ctx, r)
		if err != nil {
			return err
		}
		v.Policy = current.Policy
	}
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	if v.Mode == "inherit" {
		_, err = tx.Exec(ctx, "DELETE FROM monitoring_policies WHERE resource_id=$1", r.ID)
	} else {
		if err = validateDestinations(ctx, tx, v.Policy); err != nil {
			return err
		}
		if v.Policy.Destinations == nil {
			v.Policy.Destinations = []string{}
		}
		raw, _ := json.Marshal(v)
		_, err = tx.Exec(ctx, "INSERT INTO monitoring_policies(resource_id,data) VALUES($1,$2) ON CONFLICT(resource_id) DO UPDATE SET data=excluded.data", r.ID, raw)
	}
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "UPDATE monitoring_incidents SET state='resolved',resolved_at=now() WHERE resource_id=$1 AND state='pending'", r.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (c *Controller) evaluateMonitoring(ctx context.Context, r model.Resource, m Metric) error {
	if c.Store.Maintenance(ctx) || model.IsDeleting(r) {
		return nil
	}
	state, err := c.MonitoringPolicy(ctx, r)
	if err != nil {
		return err
	}
	p := state.Policy
	enabled := p.Enabled && state.Mode != "disabled"
	availability := enabled
	if r.Kind == "application" && (m.Status == "stopped" || m.Status == "idle" || m.Status == "not_deployed" || m.Status == "host_unavailable" || m.Status == "unknown") {
		availability = false
	}
	high := enabled && m.Online && m.Valid && ((m.CPUValid && m.CPU >= p.CPU) || m.Memory >= p.Memory || (r.Kind == "server" && m.Disk >= p.Disk))
	offline := availability && (!m.Online || r.Kind == "application" && m.Status == "degraded")
	kind := "server.offline"
	if r.Kind == "application" {
		kind = "application.offline"
	}
	availabilityKnown := !enabled || r.Kind != "application" || (m.Status != "unknown" && m.Status != "host_unavailable")
	if availabilityKnown {
		if err = c.monitoringCondition(ctx, r, m, kind, offline, time.Duration(p.OfflineSeconds)*time.Second, p.Destinations); err != nil {
			return err
		}
	}
	// Missing measurements cannot establish recovery from a firing resource
	// incident. Pending incidents restart their duration after the sample gap.
	if enabled && (!m.Online || !m.Valid) && m.Status != "stopped" && m.Status != "idle" && m.Status != "not_deployed" {
		return nil
	}
	if enabled && m.Online && m.Valid && !m.CPUValid && !high {
		return nil
	}
	return c.monitoringCondition(ctx, r, m, "resource.high", high, time.Duration(p.SustainedSeconds)*time.Second, p.Destinations)
}
func (c *Controller) monitoringCondition(ctx context.Context, r model.Resource, m Metric, kind string, active bool, duration time.Duration, destinations []string) error {
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "monitoring:"+r.ID); err != nil {
		return err
	}
	var id, state string
	var since time.Time
	var saved, previous []byte
	err = tx.QueryRow(ctx, "SELECT id,state,since,destinations,data FROM monitoring_incidents WHERE resource_id=$1 AND kind=$2 AND state<>'resolved' FOR UPDATE", r.ID, kind).Scan(&id, &state, &since, &saved, &previous)
	if errors.Is(err, pgx.ErrNoRows) {
		if !active {
			return nil
		}
		if destinations == nil {
			destinations = []string{}
		}
		raw, _ := json.Marshal(m)
		selected, _ := json.Marshal(destinations)
		_, err = tx.Exec(ctx, "INSERT INTO monitoring_incidents(id,resource_id,kind,state,since,destinations,data) VALUES($1,$2,$3,'pending',$4,$5,$6)", uuid.NewString(), r.ID, kind, m.At, selected, raw)
		if err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	if err != nil {
		return err
	}
	var old Metric
	_ = json.Unmarshal(previous, &old)
	if active && state == "pending" && m.At.Sub(old.At) > 90*time.Second {
		since = m.At
		if _, err = tx.Exec(ctx, "UPDATE monitoring_incidents SET since=$2 WHERE id=$1", id, since); err != nil {
			return err
		}
	}
	event := ""
	if !active {
		if state == "firing" {
			event = kind + ".recovered"
		}
		state = "resolved"
	} else if state == "pending" && m.At.Sub(since) >= duration {
		state = "firing"
		event = kind
	}
	raw, _ := json.Marshal(m)
	if _, err = tx.Exec(ctx, "UPDATE monitoring_incidents SET state=$2,data=$3,fired_at=CASE WHEN $2='firing' THEN COALESCE(fired_at,$4) ELSE fired_at END,resolved_at=CASE WHEN $2='resolved' THEN $4 ELSE NULL END WHERE id=$1", id, state, raw, m.At); err != nil {
		return err
	}
	if event != "" {
		var selected []string
		_ = json.Unmarshal(saved, &selected)
		if err = c.enqueueMonitoring(ctx, tx, r, event, id, selected, m); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
func (c *Controller) enqueueMonitoring(ctx context.Context, tx pgx.Tx, r model.Resource, event, incident string, selected []string, data Metric) error {
	for _, id := range selected {
		hook, err := c.Store.Resource(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		if hook.Kind != "webhook" {
			continue
		}
		if hook.TeamID != "" && hook.TeamID != r.TeamID && !c.Store.TeamGranted(ctx, hook.TeamID, r.ID) {
			continue
		}
		spec, err := model.Decode[model.Webhook](hook)
		if err != nil {
			return err
		}
		matches := len(spec.Events) == 0
		for _, filter := range spec.Events {
			if filter == "*" || filter == event {
				matches = true
			}
		}
		if !matches {
			continue
		}
		key := fmt.Sprintf("monitoring:%s:%s:%s", incident, event, id)
		payload, _ := json.Marshal(map[string]any{"id": uuid.NewSHA1(uuid.NameSpaceURL, []byte(key)).String(), "hookId": id, "event": event, "resourceId": r.ID, "teamId": r.TeamID, "at": data.At, "data": data})
		if _, err = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,'notify',$2,$3,$4) ON CONFLICT(dedupe) DO NOTHING", uuid.NewString(), id, payload, key); err != nil {
			return err
		}
	}
	return nil
}
