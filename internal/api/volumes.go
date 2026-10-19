package api

import "net/http"

func (a *API) applicationVolumes(w http.ResponseWriter, r *http.Request) {
	app, ok := a.get(w, r, false)
	if !ok {
		return
	}
	if app.Kind != "application" {
		fail(w, 400, "application required")
		return
	}
	volumes, err := a.Control.ApplicationVolumes(r.Context(), app)
	if err != nil {
		a.err(w, err)
		return
	}
	respond(w, 200, volumes)
}
