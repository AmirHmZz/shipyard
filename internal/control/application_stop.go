package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/db"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
)

var ErrApplicationStopped = db.ErrApplicationStopped
var ErrAutoDeployPaused = errors.New("automatic deployments are paused while the application is stopped")

func prepareApplicationControl(ctx context.Context, tx pgx.Tx, app string, manual bool) (int64, error) {
	if _, err := tx.Exec(ctx, "INSERT INTO application_control(app_id) VALUES($1) ON CONFLICT DO NOTHING", app); err != nil {
		return 0, err
	}
	var desired, status string
	var generation int64
	if err := tx.QueryRow(ctx, "SELECT desired_state,status,generation FROM application_control WHERE app_id=$1 FOR UPDATE", app).Scan(&desired, &status, &generation); err != nil {
		return 0, err
	}
	if status == "stopping" {
		if !manual {
			return 0, ErrAutoDeployPaused
		}
		return 0, fmt.Errorf("%w: Stop is still in progress", db.ErrConflict)
	}
	if desired == "stopped" && !manual {
		return 0, ErrAutoDeployPaused
	}
	if manual {
		if desired == "stopped" {
			generation++
		}
		if _, err := tx.Exec(ctx, "UPDATE application_control SET desired_state='running',status='running',generation=$2,error='',updated_at=now() WHERE app_id=$1", app, generation); err != nil {
			return 0, err
		}
	}
	return generation, nil
}

// Stop intent deliberately does not wait for the execution advisory lock. The
// worker holding that lock observes the durable generation and releases it.
func (c *Controller) QueueStop(ctx context.Context, app model.Resource) error {
	if app.Kind != "application" {
		return errors.New("application required")
	}
	if c.Store.Maintenance(ctx) {
		return errors.New("Shipyard is in maintenance mode")
	}
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	var deleting bool
	if err = tx.QueryRow(ctx, "SELECT COALESCE(data->>'deleting','false')='true' FROM resources WHERE id=$1", app.ID).Scan(&deleting); err != nil {
		return err
	}
	if deleting {
		return db.ErrDeleting
	}
	if _, err = tx.Exec(ctx, "INSERT INTO application_control(app_id) VALUES($1) ON CONFLICT DO NOTHING", app.ID); err != nil {
		return err
	}
	var status string
	var generation int64
	if err = tx.QueryRow(ctx, "SELECT status,generation FROM application_control WHERE app_id=$1 FOR UPDATE", app.ID).Scan(&status, &generation); err != nil {
		return err
	}
	if status == "stopping" || status == "stopped" {
		return tx.Commit(ctx)
	}
	generation++
	if _, err = tx.Exec(ctx, "UPDATE application_control SET desired_state='stopped',generation=$2,status='stopping',error='',updated_at=now() WHERE app_id=$1", app.ID, generation); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "UPDATE deployments SET state='cancelled',phase='cancelled',error='Deployment cancelled by Stop',updated_at=now() WHERE app_id=$1 AND state='queued'", app.ID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "UPDATE jobs SET state='done',last_error='Cancelled by Stop' WHERE kind='deploy' AND resource_id=$1 AND state='queued'", app.ID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "UPDATE app_runtime SET status='stopping',updated_at=now() WHERE app_id=$1", app.ID); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]int64{"generation": generation})
	if _, err = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,'application-stop',$2,$3,$4)", uuid.NewString(), app.ID, payload, "application-stop:"+app.ID+":"+strconv.FormatInt(generation, 10)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (c *Controller) deploymentFence(ctx context.Context, id string) error {
	var allowed bool
	err := c.Store.Pool.QueryRow(ctx, `SELECT COALESCE(a.desired_state,'running')='running' AND COALESCE(a.generation,0)=d.control_generation AND d.state<>'cancelled' FROM deployments d LEFT JOIN application_control a ON a.app_id=d.app_id WHERE d.id=$1`, id).Scan(&allowed)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrApplicationStopped
	}
	return nil
}

func (c *Controller) watchDeployment(parent context.Context, id string) (context.Context, func()) {
	ctx, cancel := context.WithCancelCause(parent)
	done := make(chan struct{})
	go func() {
		defer close(done)
		tick := time.NewTicker(250 * time.Millisecond)
		defer tick.Stop()
		for {
			if err := c.deploymentFence(ctx, id); err != nil {
				cancel(err)
				return
			}
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
			}
		}
	}()
	return ctx, func() { cancel(context.Canceled); <-done }
}

func (c *Controller) stopApplication(ctx context.Context, appID string, generation int64) (result error) {
	var current int64
	var desired string
	if err := c.Store.Pool.QueryRow(ctx, "SELECT generation,desired_state FROM application_control WHERE app_id=$1", appID).Scan(&current, &desired); err != nil {
		return err
	}
	if current != generation || desired != "stopped" {
		return nil
	}
	claim, err := c.Store.Pool.Exec(ctx, "UPDATE application_control SET status='stopping',error='',updated_at=now() WHERE app_id=$1 AND generation=$2 AND desired_state='stopped'", appID, generation)
	if err != nil {
		return err
	}
	if claim.RowsAffected() == 0 {
		return nil
	}
	defer func() {
		if result != nil {
			update, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			_, _ = c.Store.Pool.Exec(update, "UPDATE application_control SET status='stop_failed',error=$3,updated_at=now() WHERE app_id=$1 AND generation=$2 AND desired_state='stopped'", appID, generation, result.Error())
		}
	}()
	app, err := c.Store.Resource(ctx, appID)
	if err != nil {
		return err
	}
	if model.IsDeleting(app) {
		return db.ErrDeleting
	}
	spec, err := model.Decode[model.App](app)
	if err != nil {
		return err
	}
	servers := map[string]bool{spec.ServerID: true}
	projects := map[string]bool{"sy-" + appID: true}
	rows, err := c.Store.Pool.Query(ctx, "SELECT id FROM releases WHERE app_id=$1", appID)
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range ids {
		r, e := c.Store.Release(ctx, id)
		if e != nil {
			return e
		}
		servers[r.ServerID] = true
		projects[deploy.Project(r)] = true
	}
	var stopError error
	for server := range servers {
		if server == "" {
			continue
		}
		stopError = errors.Join(stopError, c.stopApplicationServer(ctx, appID, server, projects))
	}
	if stopError == nil {
		if _, err = c.Store.Pool.Exec(ctx, "UPDATE app_runtime SET status='stopped',updated_at=now() WHERE app_id=$1", appID); err != nil {
			return err
		}
	}
	for server := range servers {
		if server != "" {
			stopError = errors.Join(stopError, c.syncProxy(ctx, server, nil))
		}
	}
	if stopError != nil {
		return stopError
	}
	_, err = c.Store.Pool.Exec(ctx, "UPDATE application_control SET status='stopped',error='',updated_at=now() WHERE app_id=$1 AND generation=$2 AND desired_state='stopped'", appID, generation)
	return err
}

func (c *Controller) stopApplicationServer(ctx context.Context, appID, server string, projects map[string]bool) error {
	node, _, err := c.connect(ctx, server)
	if err != nil {
		return err
	}
	defer node.Close()
	items, err := inspectDeletionObjects[deletionContainer](ctx, node, "container")
	if err != nil {
		return err
	}
	owned := func(item deletionContainer) bool {
		labels := item.Config.Labels
		return labels["shipyard.app"] == appID && projects[labels["com.docker.compose.project"]] && labels["shipyard.role"] == ""
	}
	var stopError error
	for _, item := range items {
		if owned(item) {
			if _, err = deploy.Output(ctx, node, "docker", "stop", item.ID); err != nil {
				stopError = errors.Join(stopError, err)
			}
		}
	}
	// Inspect again rather than trusting a successful CLI exit status.
	items, err = inspectDeletionObjects[deletionContainer](ctx, node, "container")
	if err != nil {
		return errors.Join(stopError, err)
	}
	for _, item := range items {
		if !owned(item) {
			continue
		}
		out, e := deploy.Output(ctx, node, "docker", "inspect", "--format", "{{.State.Running}} {{.State.Restarting}}", item.ID)
		if e != nil {
			stopError = errors.Join(stopError, e)
			continue
		}
		if out != "false false" {
			stopError = errors.Join(stopError, fmt.Errorf("container %s is still running or restarting", item.ID))
		}
	}
	return stopError
}

// resumeApplication is called while the application execution lock is held.
func (c *Controller) resumeApplication(ctx context.Context, appID string) error {
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	if _, err = prepareApplicationControl(ctx, tx, appID, true); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (c *Controller) watchApplication(parent context.Context, app string) (context.Context, func(), error) {
	var generation int64
	err := c.Store.Pool.QueryRow(parent, "SELECT generation FROM application_control WHERE app_id=$1", app).Scan(&generation)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, err
	}
	ctx, cancel := context.WithCancelCause(parent)
	done := make(chan struct{})
	go func() {
		defer close(done)
		tick := time.NewTicker(250 * time.Millisecond)
		defer tick.Stop()
		for {
			var allowed bool
			err := c.Store.Pool.QueryRow(ctx, "SELECT NOT EXISTS(SELECT 1 FROM application_control WHERE app_id=$1 AND (desired_state='stopped' OR generation<>$2))", app, generation).Scan(&allowed)
			if err != nil {
				cancel(err)
				return
			}
			if !allowed {
				cancel(ErrApplicationStopped)
				return
			}
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
			}
		}
	}()
	return ctx, func() { cancel(context.Canceled); <-done }, nil
}
