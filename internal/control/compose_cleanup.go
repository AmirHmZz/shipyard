package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
)

type composeCleanup struct {
	Application string   `json:"application"`
	Version     int      `json:"version"`
	Routes      []string `json:"routes"`
	Networking  []string `json:"networking"`
	Ports       []string `json:"ports"`
}

func staleComposeSettings(r *model.Release, services map[string]any) composeCleanup {
	plan := composeCleanup{}
	for name := range r.App.Networking {
		if _, exists := services[name]; !exists {
			plan.Networking = append(plan.Networking, name)
			delete(r.App.Networking, name)
		}
	}
	for name := range r.App.PublishedPorts {
		if _, exists := services[name]; !exists {
			plan.Ports = append(plan.Ports, name)
			delete(r.App.PublishedPorts, name)
		}
	}
	kept := []model.Resource{}
	for _, resource := range r.Routes {
		route, err := model.Decode[model.Route](resource)
		if err != nil {
			continue
		} // persisted routes have already been validated
		service := route.Service
		if service == "" {
			service = "app"
		}
		if _, exists := services[service]; !exists {
			plan.Routes = append(plan.Routes, resource.ID)
		} else {
			kept = append(kept, resource)
		}
	}
	r.Routes = kept
	sort.Strings(plan.Networking)
	sort.Strings(plan.Ports)
	sort.Strings(plan.Routes)
	return plan
}

// The deployment already holds the application lock. The tree lock also fences
// API saves while DNS cleanup runs. External deletion is idempotent: on failure,
// database edits roll back and a retry can safely finish the same ownership checks.
func (c *Controller) cleanupComposeServices(ctx context.Context, r *model.Release, version int, config map[string]any, log *deploymentLog) error {
	services, ok := config["services"].(map[string]any)
	if !ok || len(services) == 0 {
		return errors.New("Compose must contain at least one service")
	}
	originalRoutes := append([]model.Resource(nil), r.Routes...)
	plan := staleComposeSettings(r, services)
	plan.Application = r.AppID
	key := "compose-cleanup:" + r.ID
	tx, err := c.Store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); err != nil {
		return err
	}
	var currentVersion int
	var data []byte
	if err = tx.QueryRow(ctx, "SELECT version,data FROM resources WHERE id=$1 FOR UPDATE", r.AppID).Scan(&currentVersion, &data); err != nil {
		return err
	}
	var previous []byte
	err = tx.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", key).Scan(&previous)
	completed := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if completed {
		if err = json.Unmarshal(previous, &plan); err != nil {
			return err
		}
		if currentVersion != plan.Version {
			return errors.New("application changed after Compose cleanup; deploy current settings")
		}
	} else {
		if len(plan.Routes)+len(plan.Networking)+len(plan.Ports) == 0 {
			return nil
		}
		if currentVersion != version {
			return errors.New("application changed; deploy current settings before removing stale Compose settings")
		}
		// Route edits have their own versions and do not increment the application.
		for _, route := range originalRoutes {
			var actualVersion int
			if err = tx.QueryRow(ctx, "SELECT version FROM resources WHERE id=$1", route.ID).Scan(&actualVersion); err != nil || actualVersion != route.Version {
				return errors.New("application domains changed; deploy current settings")
			}
		}
		for _, id := range plan.Routes {
			// Transaction locks share the domain workers' advisory-lock keys,
			// but all use this one connection even when many domains disappear.
			if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "application:"+id); err != nil {
				return err
			}
			err = c.DeleteDomain(ctx, id)
			if err != nil {
				return fmt.Errorf("remove stale domain %s: %w", id, err)
			}
			if _, err = tx.Exec(ctx, "DELETE FROM resources WHERE id=$1 AND parent_id=$2", id, r.AppID); err != nil {
				return err
			}
		}
		var values map[string]json.RawMessage
		if err = json.Unmarshal(data, &values); err != nil {
			return err
		}
		values["networking"], _ = json.Marshal(r.App.Networking)
		values["publishedPorts"], _ = json.Marshal(r.App.PublishedPorts)
		data, _ = json.Marshal(values)
		if err = tx.QueryRow(ctx, "UPDATE resources SET data=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING version", r.AppID, data).Scan(&plan.Version); err != nil {
			return err
		}
		encoded, _ := json.Marshal(plan)
		if _, err = tx.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2)", key, encoded); err != nil {
			return err
		}
		if len(plan.Routes) > 0 {
			// Proxy reconciliation must outlive a failed build or a disconnected
			// synchronous reload. The normal proxy worker retries this intent.
			if _, err = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,'proxy',$2,'{}',$3) ON CONFLICT(dedupe) DO NOTHING", uuid.NewString(), r.ServerID, "compose-cleanup-proxy:"+r.ID); err != nil {
				return err
			}
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	if !completed {
		for _, id := range plan.Routes {
			log.emit("Removed domain for missing Compose service: " + id)
			_ = c.Store.Audit(ctx, "system", "application.stale_domain_removed", r.AppID, r.TeamID, map[string]string{"routeId": id})
		}
		for _, name := range plan.Networking {
			log.emit("Removed network settings for missing Compose service: " + name)
			_ = c.Store.Audit(ctx, "system", "application.stale_networking_removed", r.AppID, r.TeamID, map[string]string{"service": name})
		}
		for _, name := range plan.Ports {
			log.emit("Removed published ports for missing Compose service: " + name)
			_ = c.Store.Audit(ctx, "system", "application.stale_ports_removed", r.AppID, r.TeamID, map[string]string{"service": name})
		}
	}
	// Never free a lease here: the active generation can still own its address.
	if len(plan.Routes) > 0 {
		if err = c.PruneProxySettings(ctx, r.ServerID); err != nil {
			return err
		}
		if err = c.syncProxy(ctx, r.ServerID, nil); err != nil {
			return err
		}
	}
	return c.filterDeletedRoutes(ctx, r)
}

func (c *Controller) filterDeletedRoutes(ctx context.Context, r *model.Release) error {
	current, err := c.Store.Children(ctx, r.AppID, "route")
	if err != nil {
		return err
	}
	exists := map[string]bool{}
	for _, route := range current {
		exists[route.ID] = true
	}
	kept := []model.Resource{}
	for _, route := range r.Routes {
		if exists[route.ID] {
			kept = append(kept, route)
		}
	}
	r.Routes = kept
	resource, err := c.Store.Resource(ctx, r.AppID)
	if err != nil {
		return err
	}
	currentApp, err := model.Decode[model.App](resource)
	if err != nil {
		return err
	}
	// A historical release cannot restore settings explicitly deleted since it was saved.
	for service := range r.App.Networking {
		if _, exists := currentApp.Networking[service]; !exists {
			delete(r.App.Networking, service)
		}
	}
	for service := range r.App.PublishedPorts {
		if _, exists := currentApp.PublishedPorts[service]; !exists {
			delete(r.App.PublishedPorts, service)
		}
	}
	return nil
}
