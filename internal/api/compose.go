package api

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
)

func (a *API) composeSource(w http.ResponseWriter, r *http.Request) {
	app, ok := a.get(w, r, true)
	if !ok {
		return
	}
	spec, err := model.Decode[model.App](app)
	if err != nil || app.Kind != "application" || spec.Source != "compose" {
		fail(w, 400, "Direct Compose application required")
		return
	}
	values, err := a.Store.Secrets(app)
	if err != nil {
		a.err(w, err)
		return
	}
	if r.Method == "GET" {
		respond(w, 200, map[string]any{"yaml": values["compose"], "version": app.Version})
		return
	}
	var input struct {
		YAML    string `json:"yaml"`
		Version int    `json:"version"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.Version != app.Version {
		fail(w, 409, "Application changed; reload the saved Compose document before saving")
		return
	}
	if err = model.ValidateComposeSource(input.YAML); err != nil {
		fail(w, 400, err.Error())
		return
	}
	updated, err := a.Store.Save(r.Context(), app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: input.Version, Secrets: map[string]string{"compose": input.YAML}})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, 409, "Application changed; reload before saving")
		} else {
			a.err(w, err)
		}
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "application.compose_saved", app.ID, app.TeamID, map[string]any{"version": updated.Version})
	respond(w, 200, map[string]any{"yaml": input.YAML, "version": updated.Version})
}
