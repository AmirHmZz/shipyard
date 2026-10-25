package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	"shipyard/internal/model"
)

// testDNSProvider verifies unsaved credentials without persisting them or changing DNS records.
func (a *API) testDNSProvider(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	var in struct {
		Provider string `json:"provider"`
		Token    string `json:"token"`
		ProxyID  string `json:"proxyId"`
	}
	if !decode(w, r, &in) {
		return
	}
	if (in.Provider != "cloudflare" && in.Provider != "arvancloud") || strings.TrimSpace(in.Token) == "" {
		fail(w, 400, "Select a supported DNS provider and enter an API token")
		return
	}
	provider, err := a.Control.DNSConnection(r.Context(), model.DNS{Provider: in.Provider, ProxyID: in.ProxyID}, in.Token)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if _, err := provider.Zones(ctx); err != nil {
		fail(w, 502, "DNS provider test failed. Check the token and its zone read permissions, then try again.")
		return
	}
	respond(w, 200, map[string]bool{"ok": true})
}
