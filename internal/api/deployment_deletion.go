package api

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"shipyard/internal/control"
)

func (a *API) deleteDeployment(w http.ResponseWriter, r *http.Request) {
	d, err := a.Store.Deployment(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		a.err(w, err)
		return
	}
	app, err := a.Store.Resource(r.Context(), d.AppID)
	if err != nil {
		a.err(w, err)
		return
	}
	if !a.Store.Access(r.Context(), user(r), app, true) {
		fail(w, 403, "Access denied")
		return
	}
	job, err := a.Control.QueueDeploymentDeletion(r.Context(), d.ID, user(r).ID)
	if errors.Is(err, control.ErrDeploymentProtected) {
		fail(w, 409, err.Error())
		return
	}
	if err != nil {
		a.err(w, err)
		return
	}
	respond(w, 202, map[string]string{"jobId": job})
}
