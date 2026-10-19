package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/db"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

type deletionPlan struct {
	Root         string   `json:"root"`
	Resources    []string `json:"resources"`
	Applications []string `json:"applications"`
	User         string   `json:"user"`
	Team         string   `json:"team"`
}

// Mark the entire tree and queue cleanup in the same transaction. Store.Save
// shares this tree lock so new children/previews cannot escape the manifest.
func (c *Controller) QueueDeletion(ctx context.Context, resource model.Resource, user string) (string, error) {
	if c.Store.Maintenance(ctx) {
		return "", errors.New("Shipyard is in maintenance mode")
	}
	if resource.Kind != "application" && resource.Kind != "project" {
		return "", errors.New("project or application required")
	}
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return "", err
	}
	var raw []byte
	if err = tx.QueryRow(ctx, "SELECT data FROM resources WHERE id=$1 FOR UPDATE", resource.ID).Scan(&raw); err != nil {
		return "", err
	}
	var state struct {
		Deleting bool   `json:"deleting"`
		Root     string `json:"deletionRoot"`
	}
	_ = json.Unmarshal(raw, &state)
	if state.Deleting && state.Root != resource.ID {
		return "", db.ErrDeleting
	}
	var jobID, jobState string
	err = tx.QueryRow(ctx, "SELECT id,state FROM jobs WHERE dedupe=$1", "delete:"+resource.ID).Scan(&jobID, &jobState)
	if err == nil {
		if jobState == "failed" {
			_, err = tx.Exec(ctx, "UPDATE jobs SET state='queued',attempts=0,last_error='',available_at=now(),lease_until=NULL,worker=NULL WHERE id=$1", jobID)
			if err != nil {
				return "", err
			}
			_, err = tx.Exec(ctx, "UPDATE resources SET data=jsonb_set(data,'{deletionError}','\"\"'::jsonb) WHERE id=$1", resource.ID)
			if err != nil {
				return "", err
			}
		}
		return jobID, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	rows, err := tx.Query(ctx, `WITH RECURSIVE tree AS (
		SELECT id,kind FROM resources WHERE id=$1
		UNION SELECT r.id,r.kind FROM resources r JOIN tree p ON r.parent_id=p.id OR (r.kind='application' AND r.data->>'previewOf'=p.id)
	) SELECT r.id,r.kind,COALESCE(r.data->>'deleting','false')='true' FROM tree JOIN resources r USING(id) ORDER BY r.id`, resource.ID)
	if err != nil {
		return "", err
	}
	plan := deletionPlan{Root: resource.ID, User: user, Team: resource.TeamID}
	for rows.Next() {
		var id, kind string
		var deleting bool
		if err = rows.Scan(&id, &kind, &deleting); err != nil {
			rows.Close()
			return "", err
		}
		if deleting {
			rows.Close()
			return "", fmt.Errorf("%w: wait for the application's cleanup before deleting this project", db.ErrDeleting)
		}
		plan.Resources = append(plan.Resources, id)
		if kind == "application" {
			plan.Applications = append(plan.Applications, id)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, `UPDATE resources SET data=data || jsonb_build_object('deleting',true,'deletionRoot',$2::text,'deletionError',''),version=version+1,updated_at=now() WHERE id=ANY($1)`, plan.Resources, resource.ID); err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, "UPDATE jobs SET state='done' WHERE resource_id=ANY($1) AND state='queued'", plan.Resources); err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, "UPDATE deployments SET state='failed',phase='cancelled',error='Application deletion requested' WHERE app_id=ANY($1) AND state='queued'", plan.Applications); err != nil {
		return "", err
	}
	data, _ := json.Marshal(plan)
	if _, err = tx.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2)", "deletion:"+resource.ID, data); err != nil {
		return "", err
	}
	jobID = uuid.NewString()
	if _, err = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,dedupe) VALUES($1,'resource-delete',$2,$3)", jobID, resource.ID, "delete:"+resource.ID); err != nil {
		return "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", err
	}
	_ = c.Store.Audit(ctx, user, "resource.deletion_requested", resource.ID, resource.TeamID, map[string]any{"jobId": jobID, "applications": len(plan.Applications)})
	return jobID, nil
}

func (c *Controller) deleteTree(ctx context.Context, job model.Job) (result error) {
	var raw []byte
	err := c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", "deletion:"+job.ResourceID).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	var plan deletionPlan
	if err = json.Unmarshal(raw, &plan); err != nil {
		return err
	}
	defer func() {
		if result != nil {
			update, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			_, _ = c.Store.Pool.Exec(update, "UPDATE resources SET data=jsonb_set(data,'{deletionError}',to_jsonb($2::text)) WHERE id=$1", plan.Root, result.Error())
			_ = c.Store.Audit(update, plan.User, "resource.deletion_failed", plan.Root, plan.Team, map[string]string{"error": result.Error()})
		}
	}()
	servers := map[string]bool{}
	for _, id := range plan.Applications {
		if err = c.removeApplication(ctx, id, servers); err != nil {
			return fmt.Errorf("clean up application %s: %w", id, err)
		}
	}
	for server := range servers {
		if err = c.PruneProxySettings(ctx, server); err != nil {
			return err
		}
		if err = c.syncProxy(ctx, server, nil); err != nil {
			return fmt.Errorf("update HAProxy after deletion: %w", err)
		}
	}
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "DELETE FROM settings WHERE (starts_with(key,'deployment-deletion:') OR starts_with(key,'fresh-deployment:')) AND value->>'application'=ANY($1)", plan.Applications); err != nil {
		return err
	}
	for _, statement := range []string{
		"DELETE FROM app_runtime WHERE app_id=ANY($1)",
		"DELETE FROM releases WHERE app_id=ANY($1)",
		"DELETE FROM deployments WHERE app_id=ANY($1)",
	} {
		if _, err = tx.Exec(ctx, statement, plan.Applications); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(ctx, "DELETE FROM jobs WHERE resource_id=ANY($1) AND id<>$2", plan.Resources, job.ID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "DELETE FROM alert_state WHERE resource_id=ANY($1)", plan.Resources); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "DELETE FROM invitations WHERE project_id=ANY($1)", plan.Resources); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "DELETE FROM settings WHERE key=$1 OR EXISTS(SELECT 1 FROM unnest($2::text[]) id WHERE (starts_with(key,'preview-event:'||id||':') OR starts_with(key,'application-volumes:'||id||':')))", "deletion:"+plan.Root, plan.Applications); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "DELETE FROM resources WHERE id=ANY($1)", plan.Resources); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	return c.Store.Audit(ctx, plan.User, "resource.deleted", plan.Root, plan.Team, map[string]any{"applications": len(plan.Applications), "volumesPreserved": true})
}

func (c *Controller) removeApplication(ctx context.Context, id string, servers map[string]bool) error {
	unlock, err := c.lock(ctx, "application:"+id)
	if err != nil {
		return err
	}
	defer unlock()
	app, err := c.Store.Resource(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	spec, err := model.Decode[model.App](app)
	if err != nil {
		return err
	}
	routes, err := c.Store.Children(ctx, id, "route")
	if err != nil {
		return err
	}
	for _, route := range routes {
		// Domain workers use this same lock, then acquire their DNS ownership lock.
		release, err := c.lock(ctx, "application:"+route.ID)
		if err != nil {
			return err
		}
		err = c.DeleteDomain(ctx, route.ID)
		if err == nil {
			_, err = c.Store.Pool.Exec(ctx, "DELETE FROM resources WHERE id=$1", route.ID)
		}
		release()
		if err != nil {
			return err
		}
	}
	rows, err := c.Store.Pool.Query(ctx, "SELECT id FROM releases WHERE app_id=$1 ORDER BY created_at", id)
	if err != nil {
		return err
	}
	ids := []string{}
	for rows.Next() {
		var release string
		if err = rows.Scan(&release); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, release)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	retained := map[string]bool{}
	for _, releaseID := range ids {
		r, err := c.Store.Release(ctx, releaseID)
		if err != nil {
			return err
		}
		retained[releaseID] = true
		if err = c.removeRelease(ctx, r, servers); err != nil {
			return err
		}
	}
	// Failed/interrupted builds may have transferred private source files without
	// reaching SaveRelease. Their encrypted queue snapshots identify the host.
	rows, err = c.Store.Pool.Query(ctx, "SELECT id,snapshot FROM deployments WHERE app_id=$1", id)
	if err != nil {
		return err
	}
	type orphan struct {
		id       string
		snapshot []byte
	}
	orphans := []orphan{}
	for rows.Next() {
		var d orphan
		if err = rows.Scan(&d.id, &d.snapshot); err != nil {
			rows.Close()
			return err
		}
		if !retained[d.id] {
			orphans = append(orphans, d)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, d := range orphans {
		plain, err := c.Store.Vault.Open(d.snapshot, "deployment:"+d.id)
		if err != nil {
			return err
		}
		var snapshot DeploymentSnapshot
		if err = json.Unmarshal(plain, &snapshot); err != nil {
			return err
		}
		r := model.Release{ID: d.id, AppID: id, ServerID: snapshot.App.ServerID, App: snapshot.App, Directory: remote.Root + "/releases/" + d.id}
		if err = c.removeRelease(ctx, r, servers); err != nil {
			return err
		}
	}
	// Prune TCP overrides even for applications that were never deployed.
	if err = c.cleanupIngress(ctx, id); err != nil {
		return err
	}
	if _, err = c.Store.Pool.Exec(ctx, "DELETE FROM settings WHERE starts_with(key,'network-lease:') AND value->>'application'=$1", id); err != nil {
		return err
	}
	if spec.ServerID != "" {
		if err = c.PruneProxySettings(ctx, spec.ServerID); err != nil {
			return err
		}
	}
	return nil
}

func (c *Controller) removeRelease(ctx context.Context, r model.Release, servers map[string]bool) error {
	if _, err := uuid.Parse(r.ID); err != nil || r.Directory != remote.Root+"/releases/"+r.ID {
		return errors.New("invalid managed release directory")
	}
	servers[r.ServerID] = true
	client, _, err := c.connect(ctx, r.ServerID)
	if err != nil {
		return err
	}
	defer client.Close()
	engine := deploy.Engine{Remote: client, Log: io.Discard}
	if err = engine.RemoveProject(ctx, r); err != nil {
		return err
	}
	for service := range r.Images {
		name := "shipyard/" + r.AppID
		if r.App.Engine == "compose" {
			name += "-" + service
		}
		_, _ = deploy.Output(ctx, client, "docker", "image", "rm", name+":"+r.ID)
	}
	_, err = deploy.Output(ctx, client, "rm", "-rf", r.Directory)
	return err
}
