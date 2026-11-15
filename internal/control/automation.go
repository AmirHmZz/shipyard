package control

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"io"
	"shipyard/internal/db"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"time"
)

func (c *Controller) automationScheduler(ctx context.Context) {
	tick := time.NewTicker(5 * time.Second)
	defer tick.Stop()
	for {
		if !c.Store.Maintenance(ctx) {
			rows, err := c.Store.Pool.Query(ctx, "SELECT app_id FROM application_automation")
			ids := []string{}
			if err == nil {
				for rows.Next() {
					var id string
					if err = rows.Scan(&id); err != nil {
						break
					}
					ids = append(ids, id)
				}
				if err == nil {
					err = rows.Err()
				}
				rows.Close()
			}
			if err != nil {
				c.Logger.Error("read application automation", "error", err)
			}
			for _, id := range ids {
				if err = c.Store.DispatchAutomation(ctx, id, time.Now()); err != nil && !errors.Is(err, pgx.ErrNoRows) {
					c.Logger.Error("dispatch application automation", "application", id, "error", err)
				}
				if err == nil {
					if err = c.requestScheduledStop(ctx, id); err != nil && !errors.Is(err, db.ErrConflict) {
						c.Logger.Error("request scheduled stop", "application", id, "error", err)
					}
				}
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

// Publish Stop intent without waiting for a deployment's execution lock. The
// existing Stop worker takes that lock after the deployment observes its fence.
func (c *Controller) requestScheduledStop(ctx context.Context, appID string) error {
	var raw []byte
	err := c.Store.Pool.QueryRow(ctx, `SELECT j.payload FROM application_automation a JOIN jobs j ON j.id=a.action_id JOIN application_control c ON c.app_id=a.app_id WHERE a.app_id=$1 AND j.payload->>'action'='stop' AND a.action_result='queued' AND c.desired_state<>'stopped' AND c.automation_generation=(j.payload->>'generation')::bigint`, appID).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	var action db.AutomationAction
	if err = json.Unmarshal(raw, &action); err != nil {
		return err
	}
	app, err := c.Store.Resource(ctx, appID)
	if err != nil {
		return err
	}
	return c.queueStop(ctx, app, false, action)
}

// Called with the application execution lock already held by the worker.
func (c *Controller) runAutomation(ctx context.Context, appID string, a db.AutomationAction) (result error) {
	app, err := c.Store.Resource(ctx, appID)
	if err != nil {
		return err
	}
	spec, err := model.Decode[model.App](app)
	if err != nil {
		return err
	}
	if spec.IsJob() || spec.PreviewOf != "" || spec.PreviewClosed || model.IsDeleting(app) {
		return nil
	}
	host, err := c.Store.Resource(ctx, spec.ServerID)
	if err != nil {
		return err
	}
	if model.IsDeleting(host) {
		return nil
	}
	var valid bool
	err = c.Store.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM application_automation a JOIN application_control c ON c.app_id=a.app_id WHERE a.app_id=$1 AND a.version=$2 AND c.automation_generation=$3 AND ($4='restart' OR (a.action_id=$5 AND a.action_result<>'succeeded')))`, appID, a.Version, a.Generation, a.Action, a.ID).Scan(&valid)
	if err != nil {
		return err
	}
	if !valid {
		if a.Action != "restart" {
			_, err = c.Store.Pool.Exec(ctx, "UPDATE application_automation SET action_result='skipped',last_action=$4,last_at=now(),last_result='skipped',last_error='Superseded by a newer manual control or schedule' WHERE app_id=$1 AND version=$2 AND action_id=$3 AND action_result='queued'", appID, a.Version, a.ID, a.Action)
		}
		return err
	}
	changed := false
	defer func() {
		if a.Action == "restart" && !changed && result == nil {
			return
		}
		status, msg := "succeeded", ""
		if result != nil {
			status = "failed"
			msg = result.Error()
		}
		update, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		_, e := c.Store.Pool.Exec(update, "UPDATE application_automation SET last_action=$3,last_at=now(),last_result=$4,last_error=$5,action_result=CASE WHEN $3='restart' THEN action_result ELSE $4 END WHERE app_id=$1 AND version=$2 AND ($3='restart' OR action_id=$6)", appID, a.Version, a.Action, status, msg, a.ID)
		if e != nil {
			c.Logger.Error("record automation result", "error", e)
		}
		_ = c.Store.Audit(update, "scheduler", "application.automated_"+a.Action, appID, app.TeamID, map[string]string{"result": status, "error": msg})
	}()
	switch a.Action {
	case "stop":
		if err = c.queueStop(ctx, app, false, a); err != nil {
			return err
		}
		var generation int64
		if err = c.Store.Pool.QueryRow(ctx, "SELECT generation FROM application_control WHERE app_id=$1", appID).Scan(&generation); err != nil {
			return err
		}
		return c.stopApplication(ctx, appID, generation)
	case "start":
		return c.actionLocked(ctx, app, "start", false, a)
	case "restart":
		var stopped bool
		if err = c.Store.Pool.QueryRow(ctx, "SELECT desired_state='stopped' FROM application_control WHERE app_id=$1", appID).Scan(&stopped); err != nil {
			return err
		}
		if stopped {
			_, err = c.Store.Pool.Exec(ctx, "UPDATE application_automation SET restart_status='[]' WHERE app_id=$1 AND version=$2", appID, a.Version)
			return err
		}
		release, err := c.Store.Active(ctx, appID)
		if err != nil {
			return err
		}
		if release.ID != a.ReleaseID {
			return nil
		}
		settings, err := c.Store.Automation(ctx, appID)
		if err != nil {
			return err
		}
		watched, stop, err := c.watchApplication(ctx, appID)
		if err != nil {
			return err
		}
		defer stop()
		node, _, err := c.connect(watched, release.ServerID)
		if err != nil {
			return err
		}
		defer node.Close()
		engine := deploy.Engine{Remote: node, Log: io.Discard}
		statuses, restarted, err := engine.RestartDue(watched, release, settings.Restarts, a.Version, time.Now())
		changed = restarted
		if statuses != nil {
			raw, e := json.Marshal(statuses)
			if e != nil {
				return e
			}
			if _, e = c.Store.Pool.Exec(ctx, "UPDATE application_automation SET restart_status=$3 WHERE app_id=$1 AND version=$2", appID, a.Version, raw); e != nil {
				return e
			}
		}
		return err
	default:
		return errors.New("unsupported automation action")
	}
}

func automationFence(ctx context.Context, tx pgx.Tx, app string, a db.AutomationAction) error {
	var generation int64
	if err := tx.QueryRow(ctx, "SELECT automation_generation FROM application_control WHERE app_id=$1 FOR UPDATE", app).Scan(&generation); err != nil {
		return err
	}
	var valid bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM application_automation WHERE app_id=$1 AND version=$2 AND action_id=$3)", app, a.Version, a.ID).Scan(&valid); err != nil {
		return err
	}
	if !valid || generation != a.Generation {
		return db.ErrConflict
	}
	return nil
}
