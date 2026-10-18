package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/db"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

var ErrDeploymentProtected = errors.New("deployment cannot be deleted")

type deploymentDeletion struct {
	Application string `json:"application"`
	Deployment  string `json:"deployment"`
	Actor       string `json:"actor"`
	JobID       string `json:"jobId"`
	Error       string `json:"error,omitempty"`
}

func deploymentDeletionKey(id string) string { return "deployment-deletion:" + id }

// The tree lock is also held by rollback queueing, so reserving a release for
// deletion and reserving it for rollback cannot both succeed.
func (c *Controller) QueueDeploymentDeletion(ctx context.Context, id, actor string) (string, error) {
	if c.Store.Maintenance(ctx) {
		return "", errors.New("Shipyard is in maintenance mode")
	}
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return "", err
	}
	var app, state string
	if err = tx.QueryRow(ctx, "SELECT app_id,state FROM deployments WHERE id=$1", id).Scan(&app, &state); err != nil {
		return "", err
	}
	var deleting bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM resources WHERE (id=$1 OR id=(SELECT data->>'serverId' FROM resources WHERE id=$1)) AND data->>'deleting'='true')", app).Scan(&deleting); err != nil {
		return "", err
	}
	if deleting {
		return "", db.ErrDeleting
	}
	if state != "healthy" && state != "failed" && state != "recovery_failed" {
		return "", fmt.Errorf("%w: wait for the deployment to finish", ErrDeploymentProtected)
	}
	var protected bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM app_runtime a JOIN releases r ON r.id=a.release_id WHERE r.deployment_id=$1)
		OR EXISTS(SELECT 1 FROM deployments WHERE rollback_id IN (SELECT id FROM releases WHERE deployment_id=$1) AND state IN ('queued','building','deploying'))`, id).Scan(&protected); err != nil {
		return "", err
	}
	if protected {
		return "", fmt.Errorf("%w: this release is active or reserved for rollback", ErrDeploymentProtected)
	}
	var raw []byte
	err = tx.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", deploymentDeletionKey(id)).Scan(&raw)
	var op deploymentDeletion
	if err == nil {
		if err = json.Unmarshal(raw, &op); err != nil {
			return "", err
		}
		if _, err = tx.Exec(ctx, "UPDATE jobs SET state='queued',attempts=0,last_error='',available_at=now(),lease_until=NULL,worker=NULL WHERE id=$1 AND state='failed'", op.JobID); err != nil {
			return "", err
		}
		op.Error = ""
	} else if errors.Is(err, pgx.ErrNoRows) {
		op = deploymentDeletion{Application: app, Deployment: id, Actor: actor, JobID: uuid.NewString()}
		payload, _ := json.Marshal(map[string]string{"deploymentId": id})
		if _, err = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,'deployment-delete',$2,$3,$4)", op.JobID, app, payload, "deployment-delete:"+id); err != nil {
			return "", err
		}
		if _, err = tx.Exec(ctx, "INSERT INTO audit(user_id,action,resource_id,team_id,detail) SELECT $1,'deployment.deletion_requested',id,team_id,$3 FROM resources WHERE id=$2", actor, app, payload); err != nil {
			return "", err
		}
	} else {
		return "", err
	}
	raw, _ = json.Marshal(op)
	if _, err = tx.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", deploymentDeletionKey(id), raw); err != nil {
		return "", err
	}
	return op.JobID, tx.Commit(ctx)
}

func (c *Controller) deleteDeployment(ctx context.Context, id string) (result error) {
	var raw []byte
	err := c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", deploymentDeletionKey(id)).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	var op deploymentDeletion
	if err = json.Unmarshal(raw, &op); err != nil {
		return err
	}
	defer func() {
		if result != nil {
			update, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			// Remote output may contain private source or Compose values.
			_, _ = c.Store.Pool.Exec(update, "UPDATE settings SET value=jsonb_set(value,'{error}',to_jsonb($2::text)) WHERE key=$1", deploymentDeletionKey(id), "Deployment cleanup failed; retry after checking the deployment server")
		}
	}()
	d, err := c.Store.Deployment(ctx, id)
	if err != nil {
		return err
	}
	var protected bool
	if err = c.Store.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM app_runtime a JOIN releases r ON r.id=a.release_id WHERE r.deployment_id=$1)", id).Scan(&protected); err != nil {
		return err
	}
	if protected {
		return ErrDeploymentProtected
	}
	r, err := c.Store.Release(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		if err = c.Store.Pool.QueryRow(ctx, "SELECT snapshot FROM deployments WHERE id=$1", id).Scan(&raw); err != nil {
			return err
		}
		plain, e := c.Store.Vault.Open(raw, "deployment:"+id)
		if e != nil {
			return e
		}
		var snap DeploymentSnapshot
		if err = json.Unmarshal(plain, &snap); err != nil {
			return err
		}
		r = model.Release{ID: id, AppID: d.AppID, ServerID: snap.App.ServerID, App: snap.App, Directory: remote.Root + "/releases/" + id}
	} else if err != nil {
		return err
	}
	if _, err = uuid.Parse(id); err != nil || r.Directory != remote.Root+"/releases/"+id {
		return errors.New("invalid managed release directory")
	}
	client, _, err := c.connect(ctx, r.ServerID)
	if err != nil {
		return err
	}
	defer client.Close()
	containers, err := inspectDeletionObjects[deletionContainer](ctx, client, "container")
	if err != nil {
		return err
	}
	for _, item := range containers {
		labels := item.Config.Labels
		if labels["shipyard.release"] != id {
			continue
		}
		if labels["shipyard.app"] != r.AppID || labels["com.docker.compose.project"] != deploy.Project(r) || labels["shipyard.role"] != "" {
			return errors.New("deployment container ownership changed")
		}
		if _, err = deploy.Output(ctx, client, "docker", "rm", "-f", item.ID); err != nil {
			return err
		}
	}
	// Compose projects span releases. Never use compose down/RemoveProject here.
	if r.App.Engine == "dockerfile" {
		networks, e := networkInventory(ctx, client)
		if e != nil {
			return e
		}
		for _, n := range networks {
			if n.Labels["com.docker.compose.project"] == deploy.Project(r) && len(n.Containers) == 0 {
				if _, err = deploy.Output(ctx, client, "docker", "network", "rm", n.ID); err != nil {
					return err
				}
			}
		}
	}
	// Remove only release-specific tags; never force-remove shared image IDs.
	images, err := deploy.Output(ctx, client, "docker", "image", "ls", "--format", "{{json .}}")
	if err != nil {
		return err
	}
	for _, line := range strings.Split(images, "\n") {
		if line == "" {
			continue
		}
		var image struct{ Repository, Tag string }
		if err = json.Unmarshal([]byte(line), &image); err != nil {
			return err
		}
		if image.Tag == id && (image.Repository == "shipyard/"+r.AppID || strings.HasPrefix(image.Repository, "shipyard/"+r.AppID+"-")) {
			if _, err = deploy.Output(ctx, client, "docker", "image", "rm", image.Repository+":"+id); err != nil {
				return err
			}
		}
	}
	rows, err := c.Store.Pool.Query(ctx, "SELECT id FROM releases WHERE id<>$1", id)
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var other string
		if err = rows.Scan(&other); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, other)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	referenced := false
	for _, item := range containers {
		for _, mount := range item.Mounts {
			if mount.Type == "bind" && (mount.Source == r.Directory || strings.HasPrefix(mount.Source, r.Directory+"/")) && item.Config.Labels["shipyard.release"] != id {
				referenced = true
			}
		}
	}
	for _, other := range ids {
		kept, e := c.Store.Release(ctx, other)
		if e != nil {
			return e
		}
		if kept.ServerID == r.ServerID && strings.Contains(kept.Compose, r.Directory+"/") {
			referenced = true
			break
		}
	}
	if !referenced {
		if _, err = deploy.Output(ctx, client, "rm", "-rf", "--", r.Directory); err != nil {
			return err
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
	if _, err = tx.Exec(ctx, "DELETE FROM settings WHERE key=ANY($1) OR (starts_with(key,'network-lease:') AND value->>'release'=$2)", []string{deploymentDeletionKey(id), freshDeploymentKey(id)}, id); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "UPDATE jobs SET state='done',lease_until=NULL WHERE kind IN ('drain','deploy') AND (payload->>'releaseId'=$1 OR payload->>'deploymentId'=$1)", id); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "DELETE FROM releases WHERE deployment_id=$1", id); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "DELETE FROM deployments WHERE id=$1", id); err != nil {
		return err
	}
	detail, _ := json.Marshal(map[string]string{"deploymentId": id})
	if _, err = tx.Exec(ctx, "INSERT INTO audit(user_id,action,resource_id,team_id,detail) SELECT $1,'deployment.deleted',id,team_id,$3 FROM resources WHERE id=$2", op.Actor, op.Application, detail); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
