package control

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"io"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"strings"
)

func (c *Controller) prune(ctx context.Context, app string) error {
	rows, e := c.Store.Pool.Query(ctx, "SELECT r.id,d.state FROM releases r JOIN deployments d ON d.id=r.deployment_id WHERE r.app_id=$1 AND d.state IN ('healthy','failed','recovery_failed') AND NOT EXISTS(SELECT 1 FROM settings WHERE key='deployment-deletion:'||d.id) ORDER BY r.created_at DESC", app)
	if e != nil {
		return e
	}
	ids := []string{}
	successful := map[string]bool{}
	for rows.Next() {
		var id string
		var state string
		if rows.Scan(&id, &state) == nil {
			ids = append(ids, id)
			successful[id] = state == "healthy"
		}
	}
	rows.Close()
	active, _ := c.Store.Active(ctx, app)
	keep := map[string]bool{active.ID: true}
	pending, err := c.Store.Pool.Query(ctx, "SELECT rollback_id FROM deployments WHERE app_id=$1 AND rollback_id<>'' AND state IN ('queued','building','deploying')", app)
	if err != nil {
		return err
	}
	for pending.Next() {
		var id string
		if pending.Scan(&id) == nil {
			keep[id] = true
		}
	}
	pending.Close()
	count := 0
	for _, id := range ids {
		if successful[id] && count < 10 {
			keep[id] = true
			count++
		}
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
		client, _, e := c.connect(ctx, r.ServerID)
		if e != nil {
			return e
		}
		engine := deploy.Engine{Remote: client, Log: io.Discard}
		if r.App.Engine == "dockerfile" {
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
			_, _ = deploy.Output(ctx, client, "docker", "image", "rm", name+":"+r.ID)
		}
		referenced := false
		for key, other := range all {
			if keep[key] && strings.Contains(other.Compose, r.Directory+"/") {
				referenced = true
			}
		}
		if !referenced {
			if _, err := uuid.Parse(r.ID); err != nil || r.Directory != remote.Root+"/releases/"+r.ID {
				client.Close()
				return errors.New("invalid managed release directory")
			}
			if _, e = deploy.Output(ctx, client, "rm", "-rf", r.Directory); e != nil {
				client.Close()
				return e
			}
		}
		client.Close()
		if _, e = c.Store.Pool.Exec(ctx, "DELETE FROM releases WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM app_runtime WHERE release_id=$1)", id); e != nil {
			return e
		}
		_, _ = c.Store.Pool.Exec(ctx, "UPDATE jobs SET state='done' WHERE kind='drain' AND payload->>'releaseId'=$1", id)
		if e = c.ReleaseNetworkLeases(ctx, id); e != nil {
			return e
		}
	}
	return nil
}
