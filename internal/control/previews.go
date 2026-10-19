package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/db"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/remote"
)

func (c *Controller) GitEvent(ctx context.Context, connection, event string, body []byte, delivery ...string) error {
	e, e2 := providers.ParseGitEvent(event, body)
	if e2 != nil {
		return nil
	}
	apps, err := c.Store.Resources(ctx, "application")
	if err != nil {
		return err
	}
	for _, app := range apps {
		spec, err := model.Decode[model.App](app)
		if err != nil {
			return err
		}
		if model.IsDeleting(app) || spec.Source == "compose" || spec.GitID != connection || spec.Repository != e.Repository || spec.PreviewOf != "" {
			continue
		}
		if event == "push" && spec.AutoDeploy && spec.Branch == e.Branch {
			key := ""
			if len(delivery) > 0 {
				key = "git:" + connection + ":" + delivery[0]
			}
			if _, err = c.queue(ctx, app, e.SHA, "", key); err != nil {
				return err
			}
		}
		if event == "pull_request" && (spec.Previews || e.Action == "closed") {
			if err = c.preview(ctx, app, spec, e, false); err != nil {
				return err
			}
		}
	}
	return nil
}
func (c *Controller) preview(ctx context.Context, app model.Resource, spec model.App, e providers.GitEvent, approved bool) (result error) {
	allUnlock, err := c.lock(ctx, "application-previews:"+app.ID)
	if err != nil {
		return err
	}
	defer allUnlock()
	current, err := c.Store.Resource(ctx, app.ID)
	if err != nil {
		return err
	}
	if model.IsDeleting(current) {
		return nil
	}
	app = current
	spec, err = model.Decode[model.App](current)
	if err != nil {
		return err
	}
	if !spec.Previews && e.Action != "closed" {
		return nil
	}
	key := fmt.Sprintf("preview-event:%s:%d", app.ID, e.PR)
	// The source-application lock above already serializes its PR events.
	if !e.UpdatedAt.IsZero() {
		var raw []byte
		var previous time.Time
		_ = c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", key).Scan(&raw)
		_ = json.Unmarshal(raw, &previous)
		if e.UpdatedAt.Before(previous) {
			return nil
		}
		defer func() {
			if result == nil {
				b, _ := json.Marshal(e.UpdatedAt)
				_, _ = c.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", key, b)
			}
		}()
	}
	var id string
	err = c.Store.Pool.QueryRow(ctx, "SELECT id FROM resources WHERE kind='application' AND data->>'previewOf'=$1 AND (data->>'pr')::integer=$2", app.ID, e.PR).Scan(&id)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	// Cleanup jobs hold this same application lock. A reopen must wait until
	// deletion finishes before it recreates routes or queues another release.
	if id != "" {
		applicationUnlock, lockErr := c.lock(ctx, "application:"+id)
		if lockErr != nil {
			return lockErr
		}
		defer applicationUnlock()
	}
	if approved {
		current, err := c.Store.Resource(ctx, id)
		if err != nil {
			return err
		}
		currentSpec, err := model.Decode[model.App](current)
		if err != nil {
			return err
		}
		if currentSpec.PreviewClosed || currentSpec.PreviewSHA != e.HeadSHA {
			return errors.New("preview head changed; review and approve the current commit")
		}
	}
	if e.Action == "closed" {
		if id != "" {
			_, err = c.Store.Pool.Exec(ctx, "UPDATE resources SET data=jsonb_set(data,'{previewClosed}','true'),version=version+1,updated_at=now() WHERE id=$1", id)
			if err != nil {
				return err
			}
			return c.Store.Enqueue(ctx, "preview-cleanup", id, "preview-cleanup:"+id+":"+db.NowID(), nil)
		}
		return nil
	}
	if e.Action != "opened" && e.Action != "reopened" && e.Action != "synchronize" && e.Action != "synchronized" && !approved {
		return nil
	}
	if (spec.PreviewRouting == nil || spec.PreviewRouting.Mode != "private") && (spec.PreviewDomain == "" || spec.PreviewZoneID == "") {
		return errors.New("configure a wildcard preview domain on the application")
	}
	if (spec.PreviewRouting == nil || spec.PreviewRouting.Mode != "private") && !c.Store.TeamGranted(ctx, app.TeamID, spec.PreviewZoneID) {
		return errors.New("preview zone must be granted to the application's team")
	}
	preview := spec
	preview.PreviewOf = app.ID
	preview.PR = e.PR
	preview.Repository = e.HeadRepo
	preview.Branch = e.HeadBranch
	preview.AutoDeploy = false
	preview.Previews = false
	preview.Networking = nil
	preview.PublishedPorts = nil
	preview.ApprovedSHA = ""
	preview.PreviewSHA = e.HeadSHA
	preview.PreviewClosed = false
	if !e.Fork || approved {
		preview.ApprovedSHA = e.HeadSHA
	}
	data, _ := json.Marshal(preview)
	secrets := map[string]string{}
	variables := map[string]*string{}
	for k, v := range app.Variables {
		if strings.HasPrefix(k, "preview-env:") {
			value := v
			variables["env:"+strings.TrimPrefix(k, "preview-env:")] = &value
		}
	}
	values, err := c.Store.Secrets(app)
	if err != nil {
		return err
	}
	for k, v := range values {
		if k == "registry_password" {
			secrets[k] = v
		}
		if strings.HasPrefix(k, "preview-env:") {
			secrets["env:"+strings.TrimPrefix(k, "preview-env:")] = v
		}
		if strings.HasPrefix(k, "preview-build:") {
			secrets["build:"+strings.TrimPrefix(k, "preview-build:")] = v
		}
	}
	version := 0
	if id != "" {
		r, e := c.Store.Resource(ctx, id)
		if e != nil {
			return e
		}
		version = r.Version
		for k := range r.Variables {
			if _, ok := variables[k]; !ok {
				variables[k] = nil
			}
		}
		oldSecrets, e := c.Store.Secrets(r)
		if e != nil {
			return e
		}
		for k := range oldSecrets {
			if strings.HasPrefix(k, "env:") || strings.HasPrefix(k, "build:") || k == "registry_password" {
				if _, ok := secrets[k]; !ok {
					if value, replacing := variables[k]; replacing && value != nil {
						continue
					}
					secrets[k] = ""
				}
			}
		}
	}
	// A secret replacing an ordinary preview value removes it atomically in Save.
	for k := range secrets {
		delete(variables, k)
	}
	r, err := c.Store.Save(ctx, id, model.ResourceInput{Kind: "application", Name: fmt.Sprintf("%s · PR #%d", app.Name, e.PR), TeamID: app.TeamID, ParentID: app.ParentID, Data: data, Secrets: secrets, Variables: variables, Version: version})
	if err != nil {
		return err
	}
	if e.Fork && !approved {
		return c.Store.Audit(ctx, "system", "preview.awaiting_approval", r.ID, r.TeamID, map[string]string{"sha": e.HeadSHA})
	}
	routes, err := c.Store.Children(ctx, r.ID, "route")
	if err != nil {
		return err
	}
	if len(routes) == 0 || spec.PreviewRouting != nil {
		original, err := c.Store.Children(ctx, app.ID, "route")
		if err != nil {
			return err
		}
		definitions := []model.Route{}
		routing := spec.EffectivePreviewRouting(original)
		switch routing.Mode {
		case "inherit":
			for _, rr := range original {
				route, e := model.Decode[model.Route](rr)
				if e == nil && route.Protocol != "tcp" {
					definitions = append(definitions, route)
				}
			}
			if len(definitions) == 0 {
				return errors.New("preview has no HTTP/gRPC routes; configure an explicit preview target or private previews")
			}
		case "target":
			definitions = append(definitions, model.Route{Protocol: "https", TargetPort: routing.Port, Service: routing.Service})
		}
		kept := map[string]bool{}
		for index, definition := range definitions {
			domain := fmt.Sprintf("pr-%d.%s", e.PR, strings.TrimPrefix(spec.PreviewDomain, "*."))
			if index > 0 {
				domain = fmt.Sprintf("pr-%d-%d.%s", e.PR, index, strings.TrimPrefix(spec.PreviewDomain, "*."))
			}
			route := definition
			route.Domain = domain
			route.TLS = "terminate"
			route.ZoneID = spec.PreviewZoneID
			raw, _ := json.Marshal(route)
			existingID, version := "", 0
			for _, existing := range routes {
				previous, decodeErr := model.Decode[model.Route](existing)
				if decodeErr == nil && previous.Domain == domain {
					existingID, version = existing.ID, existing.Version
					if previous.ZoneID != route.ZoneID {
						if err := c.DeleteDomain(ctx, existing.ID); err != nil {
							return err
						}
					}
					break
				}
			}
			rr, err := c.Store.Save(ctx, existingID, model.ResourceInput{Kind: "route", Name: domain, ParentID: r.ID, TeamID: r.TeamID, Data: raw, Version: version})
			if err != nil {
				return err
			}
			kept[rr.ID] = true
			_ = c.Store.Enqueue(ctx, "domain", rr.ID, "preview-domain:"+rr.ID+":"+db.NowID(), nil)
		}
		removed := false
		for _, previous := range routes {
			if kept[previous.ID] {
				continue
			}
			if err := c.DeleteDomain(ctx, previous.ID); err != nil {
				return err
			}
			if _, err := c.Store.Pool.Exec(ctx, "DELETE FROM resources WHERE id=$1 AND parent_id=$2", previous.ID, r.ID); err != nil {
				return err
			}
			_, _ = c.Store.Pool.Exec(ctx, "UPDATE jobs SET state='done' WHERE resource_id=$1 AND kind='domain' AND state='queued'", previous.ID)
			removed = true
		}
		if removed {
			if err := c.PruneProxySettings(ctx, spec.ServerID); err != nil {
				return err
			}
			if err := c.Store.Enqueue(ctx, "proxy", spec.ServerID, uuid.NewString(), nil); err != nil {
				return err
			}
		}
	}
	_, err = c.queue(ctx, r, e.HeadSHA, "", "preview:"+r.ID+":"+e.HeadSHA)
	return err
}
func (c *Controller) ApprovePreview(ctx context.Context, id, sha string) error {
	r, e := c.Store.Resource(ctx, id)
	if e != nil {
		return e
	}
	spec, e := model.Decode[model.App](r)
	if e != nil {
		return e
	}
	if spec.PreviewOf == "" || !model.ValidSHA(sha) || sha != spec.PreviewSHA || spec.PreviewClosed {
		return errors.New("preview and exact commit SHA required")
	}
	source, e := c.Store.Resource(ctx, spec.PreviewOf)
	if e != nil {
		return e
	}
	original, e := model.Decode[model.App](source)
	if e != nil {
		return e
	}
	if !original.Previews {
		return errors.New("PR previews are disabled")
	}
	return c.preview(ctx, source, original, providers.GitEvent{PR: spec.PR, HeadRepo: spec.Repository, HeadBranch: spec.Branch, HeadSHA: sha, Fork: true, Action: "synchronize"}, true)
}
func (c *Controller) cleanupPreview(ctx context.Context, id string) error {
	r, e := c.Store.Resource(ctx, id)
	if e != nil {
		return e
	}
	spec, e := model.Decode[model.App](r)
	if e != nil {
		return e
	}
	if spec.PreviewOf == "" {
		return errors.New("only preview applications can be automatically removed")
	}
	// A close job can be delayed behind a deployment and a subsequent reopen.
	if !spec.PreviewClosed {
		return nil
	}
	rows, e := c.Store.Pool.Query(ctx, "SELECT id FROM releases WHERE app_id=$1", id)
	if e != nil {
		return e
	}
	ids := []string{}
	for rows.Next() {
		var releaseID string
		if rows.Scan(&releaseID) == nil {
			ids = append(ids, releaseID)
		}
	}
	rows.Close()
	for _, releaseID := range ids {
		release, err := c.Store.Release(ctx, releaseID)
		if err != nil {
			return err
		}
		client, _, err := c.connect(ctx, release.ServerID)
		if err != nil {
			return err
		}
		engine := deploy.Engine{Remote: client, Log: io.Discard}
		err = engine.Remove(ctx, release, true)
		if err == nil {
			for service := range release.Images {
				name := "shipyard/" + id
				if release.App.Engine == "compose" {
					name += "-" + service
				}
				_, _ = deploy.Output(ctx, client, "docker", "image", "rm", name+":"+release.ID)
			}
		}
		client.Close()
		if err != nil {
			return err
		}
	}
	routes, e := c.Store.Children(ctx, id, "route")
	if e != nil {
		return e
	}
	for _, route := range routes {
		if e = c.DeleteDomain(ctx, route.ID); e != nil {
			return e
		}
		_, _ = c.Store.Pool.Exec(ctx, "DELETE FROM resources WHERE id=$1", route.ID)
	}
	if e = c.PruneProxySettings(ctx, spec.ServerID); e != nil {
		return e
	}
	if e = c.cleanupIngress(ctx, id); e != nil {
		return e
	}
	if _, e = c.Store.Pool.Exec(ctx, "DELETE FROM settings WHERE starts_with(key,'network-lease:') AND value->>'application'=$1", id); e != nil {
		return e
	}
	_, e = c.Store.Pool.Exec(ctx, "UPDATE app_runtime SET status='removed' WHERE app_id=$1", id)
	if e != nil {
		return e
	}
	if len(ids) > 0 {
		client, _, err := c.connect(ctx, spec.ServerID)
		if err != nil {
			return err
		}
		defer client.Close()
		for _, releaseID := range ids {
			if _, err = uuid.Parse(releaseID); err != nil {
				return err
			}
			if _, err = deploy.Output(ctx, client, "rm", "-rf", remote.Root+"/releases/"+releaseID); err != nil {
				return err
			}
		}
	}
	if e = c.syncProxy(ctx, spec.ServerID, nil); e != nil {
		return e
	}
	// Preview history remains in deployments, but ephemeral images and source
	// files are gone; these releases must no longer be offered for rollback.
	tx, e := c.Store.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "DELETE FROM app_runtime WHERE app_id=$1", id); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "DELETE FROM releases WHERE app_id=$1", id); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
