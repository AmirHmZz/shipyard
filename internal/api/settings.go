package api

import (
	"net/http"
	"shipyard/internal/control"
)

func (a *API) alertSettings(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if r.Method == http.MethodGet {
		respond(w, 200, a.Control.AlertPolicy(r.Context()))
		return
	}
	var policy control.AlertPolicy
	if !decode(w, r, &policy) {
		return
	}
	if err := policy.Validate(); err != nil {
		fail(w, 400, err.Error())
		return
	}
	if err := a.Control.SetAlertPolicy(r.Context(), policy); err != nil {
		a.err(w, err)
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "settings.alerts", "", "", policy)
	respond(w, 200, policy)
}
