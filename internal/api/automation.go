package api

import (
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"net/http"
	"reflect"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"time"
)

func (a *API) automation(w http.ResponseWriter, r *http.Request) {
	app, ok := a.get(w, r, r.Method != "GET")
	if !ok {
		return
	}
	spec, err := model.Decode[model.App](app)
	if err != nil {
		a.err(w, err)
		return
	}
	if app.Kind != "application" || spec.IsJob() || spec.PreviewOf != "" {
		fail(w, 400, "automation requires a non-preview Service application")
		return
	}
	if r.Method == "PUT" {
		var p model.AutomationSettings
		if !decode(w, r, &p) {
			return
		}
		if err = p.Validate(); err != nil {
			fail(w, 422, err.Error())
			return
		}
		if err = a.Store.SaveAutomation(r.Context(), app.ID, p); err != nil {
			if errors.Is(err, db.ErrConflict) {
				fail(w, 409, "Automation settings changed; reload before saving")
				return
			}
			a.err(w, err)
			return
		}
		_ = a.Store.Audit(r.Context(), user(r).ID, "application.automation_saved", app.ID, app.TeamID, nil)
	}
	status, err := a.Store.Automation(r.Context(), app.ID)
	if err != nil {
		a.err(w, err)
		return
	}
	upcoming := map[string][]time.Time{}
	for _, rule := range status.Rules {
		next := []time.Time{}
		if rule.Enabled {
			schedule, e := rule.Schedule()
			if e == nil {
				at := time.Now()
				for range 5 {
					at = schedule.Next(at)
					if at.IsZero() {
						break
					}
					next = append(next, at)
				}
			}
		}
		upcoming[rule.ID] = next
	}
	respond(w, 200, struct {
		db.AutomationStatus
		Upcoming map[string][]time.Time `json:"upcoming"`
	}{status, upcoming})
}

func (a *API) automationPreview(w http.ResponseWriter, r *http.Request) {
	app, ok := a.get(w, r, false)
	if !ok {
		return
	}
	spec, _ := model.Decode[model.App](app)
	if app.Kind != "application" || spec.IsJob() || spec.PreviewOf != "" {
		fail(w, 400, "Service application required")
		return
	}
	p := model.DefaultJobSettings()
	p.Cron = r.URL.Query().Get("cron")
	p.Timezone = r.URL.Query().Get("timezone")
	if _, err := p.Schedule(); err != nil {
		fail(w, 422, err.Error())
		return
	}
	p.Preview(time.Now())
	respond(w, 200, map[string]any{"upcoming": p.Upcoming})
}

func (a *API) resourceLimits(w http.ResponseWriter, r *http.Request) {
	app, ok := a.get(w, r, r.Method != "GET")
	if !ok {
		return
	}
	if app.Kind != "application" {
		fail(w, 400, "application required")
		return
	}
	spec, err := model.Decode[model.App](app)
	if err != nil {
		a.err(w, err)
		return
	}
	if r.Method == "PUT" {
		if a.Store.Maintenance(r.Context()) || model.IsDeleting(app) {
			fail(w, 409, "Application unavailable during maintenance or deletion")
			return
		}
		var input struct {
			Version  int                            `json:"version"`
			Services map[string]model.ServiceLimits `json:"services"`
		}
		if !decode(w, r, &input) {
			return
		}
		if input.Version != app.Version {
			fail(w, 409, "Application changed; reload before saving")
			return
		}
		if err = model.ValidateResourceLimits(input.Services); err != nil {
			fail(w, 422, err.Error())
			return
		}
		spec.ResourceLimits = input.Services
		data, e := json.Marshal(spec)
		if e != nil {
			a.err(w, e)
			return
		}
		saved, e := a.Store.Save(r.Context(), app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: data, Version: app.Version})
		if e != nil {
			a.err(w, e)
			return
		}
		app = saved
		_ = a.Store.Audit(r.Context(), user(r).ID, "application.resource_limits_saved", app.ID, app.TeamID, nil)
	}
	applied := map[string]model.ServiceLimits{}
	release, e := a.Store.Active(r.Context(), app.ID)
	if e != nil && !errors.Is(e, pgx.ErrNoRows) {
		a.err(w, e)
		return
	}
	if e == nil && release.App.ResourceLimits != nil {
		applied = release.App.ResourceLimits
	}
	if spec.ResourceLimits == nil {
		spec.ResourceLimits = map[string]model.ServiceLimits{}
	}
	respond(w, 200, map[string]any{"version": app.Version, "services": spec.ResourceLimits, "applied": applied, "pending": !reflect.DeepEqual(spec.ResourceLimits, applied)})
}
