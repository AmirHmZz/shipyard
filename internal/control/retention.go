package control

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"io"
	"shipyard/internal/db"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"strings"
)

const releaseInUse = `EXISTS(SELECT 1 FROM app_runtime WHERE app_id=r.app_id AND release_id=r.id)
	OR EXISTS(SELECT 1 FROM deployments WHERE app_id=r.app_id AND rollback_id=r.id AND state IN ('queued','building','deploying'))
	OR EXISTS(SELECT 1 FROM job_runs WHERE app_id=r.app_id AND release_id=r.id AND (state IN ` + db.ActiveJobStates + ` OR cleanup_pending))`

// The worker holds the application lock. Reserve under the tree lock shared
// with rollback admission, manual deletion, and Job admission.
func (c *Controller) reservePrune(ctx context.Context, app string) ([]string, map[string]bool, error) {
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return nil, nil, err
	}
	rows, err := tx.Query(ctx, `SELECT r.id,d.state,(`+releaseInUse+`),
		EXISTS(SELECT 1 FROM settings WHERE key='release-prune:'||r.id)
		FROM releases r JOIN deployments d ON d.id=r.deployment_id
		WHERE r.app_id=$1 AND NOT EXISTS(SELECT 1 FROM settings WHERE key='deployment-deletion:'||d.id)
		ORDER BY r.created_at DESC,r.id DESC`, app)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	ids, candidates := []string{}, []string{}
	keep := map[string]bool{}
	count := 0
	for rows.Next() {
		var id, state string
		var protected, reserved bool
		if err = rows.Scan(&id, &state, &protected, &reserved); err != nil {
			return nil, nil, err
		}
		ids = append(ids, id)
		recent := state == "healthy" && !reserved && count < 10
		if recent {
			count++
		}
		switch {
		case protected, recent:
			keep[id] = true
		case state == "healthy", state == "failed", state == "recovery_failed", state == "cancelled":
			candidates = append(candidates, id)
		default:
			keep[id] = true
		}
	}
	if err = rows.Err(); err != nil {
		return nil, nil, err
	}
	rows.Close()
	if len(candidates) > 0 {
		if _, err = tx.Exec(ctx, `INSERT INTO settings(key,value)
			SELECT 'release-prune:'||id,jsonb_build_object('application',$1::text)
			FROM unnest($2::text[]) AS ids(id) ON CONFLICT DO NOTHING`, app, candidates); err != nil {
			return nil, nil, err
		}
	}
	return ids, keep, tx.Commit(ctx)
}

func (c *Controller) prune(ctx context.Context, app string) error {
	ids, keep, err := c.reservePrune(ctx, app)
	if err != nil {
		return err
	}
	all := map[string]model.Release{}
	for _, id := range ids {
		r, e := c.Store.Release(ctx, id)
		if e != nil {
			return e
		}
		all[id] = r
	}
	for _, id := range ids {
		if keep[id] {
			continue
		}
		r := all[id]
		if _, err := uuid.Parse(r.ID); err != nil || r.Directory != remote.Root+"/releases/"+r.ID {
			return errors.New("invalid managed release directory")
		}
		client, _, e := c.connect(ctx, r.ServerID)
		if e != nil {
			return e
		}
		if e = c.recordApplicationVolumes(ctx, client, r); e != nil {
			client.Close()
			return e
		}
		engine := deploy.Engine{Remote: client, Log: io.Discard}
		if r.App.Engine == "dockerfile" && !r.App.IsJob() {
			if e = engine.Remove(ctx, r, false); e != nil {
				client.Close()
				return e
			}
		}
		for service := range r.Images {
			name := "shipyard/" + r.AppID
			if r.App.Engine == "compose" {
				name += "-" + service
			}
			tag := name + ":" + r.ID
			if _, removeErr := deploy.Output(ctx, client, "docker", "image", "rm", tag); removeErr != nil {
				remaining, listErr := deploy.Output(ctx, client, "docker", "image", "ls", "-q", "--filter", "reference="+tag)
				if listErr != nil || remaining != "" {
					client.Close()
					return errors.Join(removeErr, listErr)
				}
			}
		}
		referenced := false
		for key, other := range all {
			if keep[key] && strings.Contains(other.Compose, r.Directory+"/") {
				referenced = true
			}
		}
		if !referenced {
			if _, e = deploy.Output(ctx, client, "rm", "-rf", r.Directory); e != nil {
				client.Close()
				return e
			}
		}
		client.Close()
		if e = c.finishPrune(ctx, id); e != nil {
			return e
		}
	}
	return nil
}

func (c *Controller) finishPrune(ctx context.Context, id string) error {
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, "DELETE FROM releases r WHERE r.id=$1 AND NOT ("+releaseInUse+")", id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrDeploymentProtected
	}
	if _, err = tx.Exec(ctx, "UPDATE jobs SET state='done' WHERE kind='drain' AND payload->>'releaseId'=$1", id); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "DELETE FROM settings WHERE key='release-prune:'||$1 OR (starts_with(key,'network-lease:') AND value->>'release'=$1)", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
