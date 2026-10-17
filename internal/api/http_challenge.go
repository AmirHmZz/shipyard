package api

import (
	"github.com/go-chi/chi/v5"
	"net/http"
	"net/url"
	"shipyard/internal/certs"
	"strings"
)

func (a *API) httpChallenge(w http.ResponseWriter, r *http.Request) {
	if a.Control == nil || a.Control.Local == nil {
		http.NotFound(w, r)
		return
	}
	s, e := a.Control.Dashboard(r.Context())
	u, hostErr := url.Parse("http://" + r.Host)
	if e != nil || hostErr != nil {
		http.NotFound(w, r)
		return
	}
	host := strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
	if host == "" || (host != s.Domain && host != s.ActiveDomain) {
		http.NotFound(w, r)
		return
	}
	value, ok := certs.HTTPChallenge(r.Context(), a.Store, r.Host, chi.URLParam(r, "token"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte(value))
}
