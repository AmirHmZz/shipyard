package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"shipyard/internal/db"
)

func (a *API) zoneGrants(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	zone, ok := a.get(w, r, false)
	if !ok {
		return
	}
	if zone.Kind != "zone" {
		fail(w, 400, "DNS zone required")
		return
	}
	grants, err := a.Store.ZoneGrants(r.Context(), zone.ID)
	if err != nil {
		a.err(w, err)
		return
	}
	respond(w, 200, grants)
}

func (a *API) setZoneGrant(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	zone, ok := a.get(w, r, true)
	if !ok {
		return
	}
	if zone.Kind != "zone" {
		fail(w, 400, "DNS zone required")
		return
	}
	var input db.ZoneGrant
	if !decode(w, r, &input) {
		return
	}
	if err := a.Store.SetZoneGrant(r.Context(), user(r).ID, zone.ID, chi.URLParam(r, "teamId"), input, false); err != nil {
		a.err(w, err)
		return
	}
	respond(w, 200, map[string]bool{"ok": true})
}

func (a *API) applicationDomainAccess(w http.ResponseWriter, r *http.Request) {
	app, ok := a.get(w, r, false)
	if !ok {
		return
	}
	if app.Kind != "application" {
		fail(w, 400, "Application required")
		return
	}
	zones, err := a.Store.TeamZoneAccess(r.Context(), app.TeamID)
	if err != nil {
		a.err(w, err)
		return
	}
	respond(w, 200, zones)
}
