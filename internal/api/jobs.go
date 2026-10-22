package api

import (
	"errors"
	"github.com/go-chi/chi/v5"
	"net/http"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"strconv"
	"strings"
	"time"
)

func (a *API) jobApplication(w http.ResponseWriter, r *http.Request, write bool) (model.Resource, bool) {
	app, ok := a.get(w, r, write)
	if !ok {
		return app, false
	}
	spec, _ := model.Decode[model.App](app)
	if app.Kind != "application" || !spec.IsJob() {
		fail(w, 400, "Job application required")
		return app, false
	}
	if write && !strings.HasSuffix(r.URL.Path, "/cancel") && (a.Store.Maintenance(r.Context()) || model.IsDeleting(app)) {
		fail(w, 409, "Job application is unavailable during maintenance or deletion")
		return app, false
	}
	return app, true
}
func (a *API) jobSettings(w http.ResponseWriter, r *http.Request) {
	app, ok := a.jobApplication(w, r, r.Method != "GET")
	if !ok {
		return
	}
	if r.Method == "GET" {
		p, err := a.Store.JobSettings(r.Context(), app.ID)
		if err != nil {
			a.err(w, err)
			return
		}
		if r.URL.Query().Has("cron") {
			p.Cron = r.URL.Query().Get("cron")
			p.Timezone = r.URL.Query().Get("timezone")
			if _, err = p.Schedule(); err != nil {
				fail(w, 422, err.Error())
				return
			}
			p.Preview(time.Now())
		}
		respond(w, 200, p)
		return
	}
	var p model.JobSettings
	if !decode(w, r, &p) {
		return
	}
	if err := p.Validate(); err != nil {
		fail(w, 422, err.Error())
		return
	}
	saved, err := a.Store.SaveJobSettings(r.Context(), app.ID, p)
	if err != nil {
		if errors.Is(err, db.ErrConflict) {
			a.err(w, err)
		} else {
			fail(w, 409, err.Error())
		}
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "job.settings_changed", app.ID, app.TeamID, nil)
	respond(w, 200, saved)
}
func (a *API) jobRuns(w http.ResponseWriter, r *http.Request) {
	app, ok := a.jobApplication(w, r, r.Method != "GET")
	if !ok {
		return
	}
	if r.Method == "GET" {
		rows, err := a.Store.JobRuns(r.Context(), app.ID, r.URL.Query().Get("before"))
		if err != nil {
			a.err(w, err)
			return
		}
		next := ""
		if len(rows) == 50 {
			next = rows[len(rows)-1].ID
		}
		active,err:=a.Store.ActiveJobRun(r.Context(),app.ID);if err!=nil { a.err(w,err);return }
		respond(w, 200, map[string]any{"items": rows, "nextCursor": next,"activeRun":active})
		return
	}
	var input struct {
		IdempotencyKey string `json:"idempotencyKey"`
	}
	if r.ContentLength != 0 && !decode(w, r, &input) {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if key == "" {
		key = input.IdempotencyKey
	}
	if len(key) > 200 {
		fail(w, 400, "Idempotency key must be at most 200 bytes")
		return
	}
	run, err := a.Store.QueueJobRun(r.Context(), app.ID, user(r).ID, key)
	if err != nil {
		var busy *db.JobBusyError
		if errors.As(err, &busy) {
			respond(w, 409, map[string]string{"error": busy.Error(), "activeRunId": busy.RunID})
		} else {
			fail(w, 409, err.Error())
		}
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "job.run_requested", app.ID, app.TeamID, map[string]string{"runId": run.ID})
	respond(w, 202, run)
}
func (a *API) jobRun(w http.ResponseWriter, r *http.Request) {
	app, ok := a.jobApplication(w, r, r.Method != "GET")
	if !ok {
		return
	}
	run, err := a.Store.JobRun(r.Context(), app.ID, chi.URLParam(r, "runId"))
	if err != nil {
		a.err(w, err)
		return
	}
	if r.Method == "POST" {
		if err = a.Store.CancelJobRun(r.Context(), app.ID, run.ID); err != nil {
			a.err(w, err)
			return
		}
		_ = a.Store.Audit(r.Context(), user(r).ID, "job.cancel_requested", app.ID, app.TeamID, map[string]string{"runId": run.ID})
		run, err = a.Store.JobRun(r.Context(), app.ID, run.ID)
		if err != nil {
			a.err(w, err)
			return
		}
	}
	respond(w, 200, run)
}
func (a *API) jobRunEvents(w http.ResponseWriter, r *http.Request) {
	app, ok := a.jobApplication(w, r, false)
	if !ok {
		return
	}
	id := chi.URLParam(r, "runId")
	if _, err := a.Store.JobRun(r.Context(), app.ID, id); err != nil {
		a.err(w, err)
		return
	}
	if !a.streamAccess(r, app, false) {
		fail(w, 403, "Access denied")
		return
	}
	if !sse(w) {
		return
	}
	after := queryInt(r, "after")
	if v, err := strconv.ParseInt(r.Header.Get("Last-Event-ID"), 10, 64); err == nil && v > after {
		after = v
	}
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		if !a.streamAccess(r, app, false) {
			return
		}
		events, err := a.Store.JobEvents(r.Context(), id, after)
		if err != nil {
			return
		}
		for _, event := range events {
			sendEvent(w, "log", event.ID, event)
			after = event.ID
		}
		run, err := a.Store.JobRun(r.Context(), app.ID, id)
		if err != nil {
			return
		}
		if !run.Active() && !run.CleanupPending && len(events) == 500 {
			continue
		}
		sendEvent(w, "status", 0, run)
		if !run.Active() && !run.CleanupPending {
			return
		}
		select {
		case <-r.Context().Done():
			return
		case <-tick.C:
		}
	}
}
