package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (a *API) controlPlaneNetworks(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	status, err := a.Control.ControlPlaneNetworkStatus(r.Context())
	if err != nil {
		fail(w, 502, err.Error())
		return
	}
	respond(w, 200, status)
}

func (a *API) controlPlaneNetwork(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if a.Store.Maintenance(r.Context()) {
		fail(w, 409, "Shipyard is in maintenance mode")
		return
	}
	var input struct {
		Attached *bool `json:"attached"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.Attached == nil {
		fail(w, 400, "attached is required")
		return
	}
	id := chi.URLParam(r, "id")
	status, err := a.Control.SetControlPlaneNetwork(r.Context(), id, *input.Attached)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "network.control-plane.updated", id, "", input)
	respond(w, 200, status)
}
