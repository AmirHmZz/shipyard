package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"shipyard/internal/model"
)

// CleanupPathRoutes is an explicit maintenance command, never a startup migration.
func (c *Controller) CleanupPathRoutes(ctx context.Context) (int, error) {
	routes, err := c.Store.Resources(ctx, "route")
	if err != nil {
		return 0, err
	}
	count := 0
	var failures []error
	for _, route := range routes {
		var legacy struct {
			Path     string `json:"path"`
			Protocol string `json:"protocol"`
		}
		if err = json.Unmarshal(route.Data, &legacy); err != nil {
			return count, err
		}
		if legacy.Protocol == "tcp" || legacy.Path == "" || legacy.Path == "/" {
			continue
		}
		app, err := c.Store.Resource(ctx, route.ParentID)
		if err != nil {
			return count, err
		}
		spec, err := model.Decode[model.App](app)
		if err != nil {
			return count, err
		}
		if err = c.DeleteDomain(ctx, route.ID); err != nil {
			failures = append(failures, fmt.Errorf("route %s: %w", route.ID, err))
			continue
		}
		if _, err = c.Store.Pool.Exec(ctx, "DELETE FROM resources WHERE id=$1", route.ID); err != nil {
			return count, err
		}
		if err = c.PruneProxySettings(ctx, spec.ServerID); err != nil {
			return count, err
		}
		if err = c.Store.Enqueue(ctx, "proxy", spec.ServerID, uuid.NewString(), nil); err != nil {
			return count, err
		}
		_ = c.Store.Audit(ctx, "system", "route.path_removed", route.ID, route.TeamID, nil)
		count++
	}
	return count, errors.Join(failures...)
}
