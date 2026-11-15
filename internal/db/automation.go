package db

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
	"time"
)

type AutomationStatus struct {
	model.AutomationSettings
	LastAction    string          `json:"lastAction"`
	LastAt        *time.Time      `json:"lastAt"`
	LastResult    string          `json:"lastResult"`
	LastError     string          `json:"lastError"`
	RestartStatus json.RawMessage `json:"restartStatus"`
}
type AutomationAction struct {
	ID         string `json:"id"`
	Version    int64  `json:"version"`
	Generation int64  `json:"generation"`
	ReleaseID  string `json:"releaseId"`
	Action     string `json:"action"`
}

func (s *Store) Automation(ctx context.Context, app string) (AutomationStatus, error) {
	result := AutomationStatus{AutomationSettings: model.DefaultAutomationSettings(), RestartStatus: json.RawMessage(`[]`)}
	var raw []byte
	err := s.Pool.QueryRow(ctx, "SELECT version,policy,last_action,last_at,last_result,last_error,restart_status FROM application_automation WHERE app_id=$1", app).Scan(&result.Version, &raw, &result.LastAction, &result.LastAt, &result.LastResult, &result.LastError, &result.RestartStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	version := result.Version
	err = json.Unmarshal(raw, &result.AutomationSettings)
	result.Version = version
	return result, err
}
func (s *Store) SaveAutomation(ctx context.Context, app string, p model.AutomationSettings) error {
	if err := p.Validate(); err != nil {
		return err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// Match worker lock order: application execution lock before resource-tree.
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "application:"+app); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	var raw []byte
	if err = tx.QueryRow(ctx, "SELECT data FROM resources WHERE id=$1 AND kind='application'", app).Scan(&raw); err != nil {
		return err
	}
	var spec model.App
	if err = json.Unmarshal(raw, &spec); err != nil {
		return err
	}
	var unavailable bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM resources WHERE id IN ($1,$2) AND data->>'deleting'='true') OR COALESCE((SELECT value::text='true' FROM settings WHERE key='maintenance'),false)`, app, spec.ServerID).Scan(&unavailable); err != nil {
		return err
	}
	if unavailable {
		return ErrDeleting
	}
	if spec.IsJob() || spec.PreviewOf != "" {
		return errors.New("automation requires a non-preview Service application")
	}
	if p.Restarts == nil {
		p.Restarts = []model.RestartPolicy{}
	}
	if p.Rules == nil {
		p.Rules = []model.AutomationRule{}
	}
	raw, err = json.Marshal(p)
	if err != nil {
		return err
	}
	var tag int64
	if p.Version == 0 {
		result, e := tx.Exec(ctx, "INSERT INTO application_automation(app_id,policy) VALUES($1,$2) ON CONFLICT DO NOTHING", app, raw)
		err = e
		tag = result.RowsAffected()
	} else {
		result, e := tx.Exec(ctx, "UPDATE application_automation SET version=version+1,policy=$3,checked_at=now(),action_id='',action_result='',last_result='',last_error='',restart_status='[]' WHERE app_id=$1 AND version=$2", app, p.Version, raw)
		err = e
		tag = result.RowsAffected()
	}
	if err != nil {
		return err
	}
	if tag != 1 {
		return ErrConflict
	}
	return tx.Commit(ctx)
}

func (s *Store) DispatchAutomation(ctx context.Context, app string, now time.Time) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var p model.AutomationSettings
	var raw []byte
	var checked time.Time
	var version int64
	err = tx.QueryRow(ctx, "SELECT version,policy,checked_at FROM application_automation WHERE app_id=$1 FOR UPDATE", app).Scan(&version, &raw, &checked)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if err = json.Unmarshal(raw, &p); err != nil {
		return err
	}
	var specRaw []byte
	if err = tx.QueryRow(ctx, "SELECT data FROM resources WHERE id=$1", app).Scan(&specRaw); err != nil {
		return err
	}
	var spec model.App
	if err = json.Unmarshal(specRaw, &spec); err != nil {
		return err
	}
	if spec.IsJob() || spec.PreviewOf != "" {
		return nil
	}
	var deleting bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM resources WHERE id IN ($1,$2) AND data->>'deleting'='true')", app, spec.ServerID).Scan(&deleting); err != nil {
		return err
	}
	if deleting {
		return nil
	}
	if _, err = tx.Exec(ctx, "INSERT INTO application_control(app_id) VALUES($1) ON CONFLICT DO NOTHING", app); err != nil {
		return err
	}
	var generation int64
	var manuallyChanged time.Time
	if err = tx.QueryRow(ctx, "SELECT automation_generation,automation_manual_at FROM application_control WHERE app_id=$1", app).Scan(&generation, &manuallyChanged); err != nil {
		return err
	}
	rule, due := p.LatestAction(checked, now)
	enqueue := func(kind, key string, a AutomationAction) error {
		payload, e := json.Marshal(a)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedupe) DO NOTHING", a.ID, kind, app, payload, key)
		return e
	}
	// A manual control after a missed occurrence supersedes that occurrence.
	if !due.IsZero() && !due.Before(manuallyChanged) {
		a := AutomationAction{ID: uuid.NewString(), Version: version, Generation: generation, Action: rule.Action}
		if err = enqueue("application-automation", a.ID, a); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "UPDATE application_automation SET action_id=$2,action_result='queued',last_action=$3,last_at=$4,last_result='queued',last_error='' WHERE app_id=$1", app, a.ID, a.Action, due); err != nil {
			return err
		}
	}
	enabled := false
	for _, r := range p.Restarts {
		enabled = enabled || r.Enabled
	}
	if enabled {
		var release string
		err = tx.QueryRow(ctx, "SELECT release_id FROM app_runtime WHERE app_id=$1", app).Scan(&release)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if release != "" {
			a := AutomationAction{ID: uuid.NewString(), Version: version, Generation: generation, Action: "restart", ReleaseID: release}
			key := "periodic-restart:" + app + ":" + now.UTC().Truncate(30*time.Second).Format(time.RFC3339)
			if err = enqueue("application-restart", key, a); err != nil {
				return err
			}
		}
	}
	if _, err = tx.Exec(ctx, "UPDATE application_automation SET checked_at=$2 WHERE app_id=$1", app, now); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
