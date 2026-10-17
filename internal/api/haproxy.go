package api

import (
	"errors"
	"net/http"

	"shipyard/internal/control"
)

func (a *API) haproxySettings(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	server, ok := a.get(w, r, true)
	if !ok {
		return
	}
	if server.Kind != "server" {
		fail(w, 400, "Server required")
		return
	}
	if r.Method == "GET" {
		state, err := a.Control.ProxyState(r.Context(), server.ID)
		if err != nil {
			a.err(w, err)
			return
		}
		respond(w, 200, state)
		return
	}
	var input control.ProxySettingsInput
	if !decode(w, r, &input) {
		return
	}
	if input.Version < 0 {
		fail(w, 400, "Invalid settings revision")
		return
	}
	id, err := a.Control.QueueProxySettings(r.Context(), server.ID, user(r).ID, input)
	if err != nil {
		if errors.Is(err, control.ErrProxyConflict) {
			fail(w, 409, err.Error())
		} else if errors.Is(err, control.ErrInvalidProxyBindings) {
			fail(w, 400, err.Error())
		} else {
			a.err(w, err)
		}
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "haproxy.settings_requested", server.ID, "", map[string]any{"jobId": id, "version": input.Version})
	respond(w, 202, map[string]string{"jobId": id})
}
