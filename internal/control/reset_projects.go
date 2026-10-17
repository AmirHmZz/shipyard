package control

import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
)

// CleanupProjects is an explicit administrator operation, never a startup task.
// It uses the same ownership checks and recoverable cleanup as dashboard deletes.
func (c *Controller) CleanupProjects(ctx context.Context) error {
	for {
		resources, err := c.Store.Resources(ctx, "")
		if err != nil {
			return err
		}
		pending := false
		for _, r := range resources {
			if model.IsDeleting(r) {
				pending = true
			}
		}
		if !pending {
			var root *model.Resource
			for _, kind := range []string{"project", "application", "environment", "route"} {
				for i := range resources {
					if resources[i].Kind == kind {
						root = &resources[i]
						break
					}
				}
				if root != nil {
					break
				}
			}
			if root == nil {
				break
			}
			if root.Kind == "environment" {
				if _, err = c.Store.Pool.Exec(ctx, "DELETE FROM resources WHERE id=$1", root.ID); err != nil {
					return err
				}
				continue
			}
			if root.Kind == "route" {
				if err = c.DeleteDomain(ctx, root.ID); err != nil {
					return err
				}
				if _, err = c.Store.Pool.Exec(ctx, "DELETE FROM resources WHERE id=$1", root.ID); err != nil {
					return err
				}
				continue
			}
			if _, err = c.QueueDeletion(ctx, *root, "system"); err != nil {
				return err
			}
		}
		// Explicit reset retries a previously failed cleanup immediately, but stops
		// on its next failure instead of bypassing remote cleanup.
		if _, err = c.Store.Pool.Exec(ctx, "UPDATE jobs SET state='queued',available_at=now(),lease_until=NULL,worker=NULL WHERE kind='resource-delete' AND state IN ('failed','queued','running')"); err != nil {
			return err
		}
		job, err := c.Store.Claim(ctx, "project-reset", "resource-delete")
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("deleting resources have no recoverable cleanup job")
		}
		if err != nil {
			return err
		}
		if err = c.deleteTree(ctx, job); err != nil {
			_ = c.Store.Finish(ctx, job, "project-reset", err)
			return err
		}
		if err = c.Store.Finish(ctx, job, "project-reset", nil); err != nil {
			return err
		}
	}
	_, err := c.Store.Pool.Exec(ctx, "UPDATE resources SET data=data-'previewDomain'-'previewZoneId' WHERE kind='server'")
	return err
}
