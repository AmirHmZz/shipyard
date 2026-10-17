package api

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"shipyard/internal/certs"
	"shipyard/internal/control"
	"shipyard/internal/db"
)

func (a *API) canonicalOrigin(ctx context.Context) string {
	if a.Control != nil && a.Control.Local != nil {
		if state, e := a.Control.Dashboard(ctx); e == nil && state.Origin != "" {
			return state.Origin
		}
	}
	return a.Origin
}
func (a *API) allowedOrigin(r *http.Request, origin string) bool {
	if a.Control == nil || a.Control.Local == nil {
		return origin == a.Origin
	}
	s, e := a.Control.Dashboard(r.Context())
	return e == nil && origin != "" && (origin == s.Origin)
}
func (a *API) requestOrigin(r *http.Request) string {
	if a.Control != nil && a.Control.Local != nil {
		if s, e := a.Control.Dashboard(r.Context()); e == nil {
			for _, origin := range []string{s.Origin} {
				u, e := url.Parse(origin)
				if e == nil && u.Scheme == "https" && u.Host == r.Host && r.Header.Get("X-Forwarded-Proto") == "https" && a.Control.DashboardProxyPeer(r.Context(), r.RemoteAddr) {
					return origin
				}
			}

		}
	}
	return a.canonicalOrigin(r.Context())
}
func (a *API) dashboardAccess(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if r.Method == "GET" {
		s, e := a.Control.Dashboard(r.Context())
		if e != nil {
			a.err(w, e)
			return
		}
		respond(w, 200, s)
		return
	}
	var in struct {
		Version   int    `json:"version"`
		Domain    string `json:"domain"`
		ACMEEmail string `json:"acmeEmail"`
		AcceptTOS bool   `json:"acceptTos"`
	}
	if !decode(w, r, &in) {
		return
	}
	var config []certs.Configuration
	if in.ACMEEmail != "" || in.AcceptTOS {
		config = append(config, certs.Configuration{Email: in.ACMEEmail, AcceptTOS: in.AcceptTOS})
	}
	id, e := a.Control.QueueDashboard(r.Context(), in.Version, in.Domain, user(r).ID, config...)
	a.dashboardQueued(w, id, e)
}
func (a *API) dashboardQueued(w http.ResponseWriter, id string, e error) {
	if errors.Is(e, db.ErrConflict) {
		a.err(w, e)
		return
	}
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	respond(w, 202, map[string]string{"jobId": id})
}
func (a *API) retryDashboard(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	var in struct {
		Version int `json:"version"`
	}
	if !decode(w, r, &in) {
		return
	}
	s, e := a.Control.Dashboard(r.Context())
	if e != nil {
		a.err(w, e)
		return
	}
	id, e := a.Control.QueueDashboard(r.Context(), in.Version, s.Domain, user(r).ID)
	a.dashboardQueued(w, id, e)
}
func protectedResource(id string) bool { return control.Protected(id) }
