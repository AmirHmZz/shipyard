package api

import (
	"errors"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"shipyard/internal/db"
)

type mcpTokenInventory struct {
	Endpoint string          `json:"endpoint"`
	Tokens   []db.MCPToken   `json:"tokens"`
	Projects []db.MCPProject `json:"projects"`
}

func (a *API) mcpTokens(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	tokens, err := a.Store.MCPTokens(r.Context())
	if err != nil {
		a.err(w, err)
		return
	}
	projects, err := a.Store.MCPProjects(r.Context())
	if err != nil {
		a.err(w, err)
		return
	}
	endpoint := ""
	if parsed, err := url.Parse(a.canonicalOrigin(r.Context())); err == nil && parsed.Scheme == "https" && parsed.Host != "" {
		endpoint = (&url.URL{Scheme: "https", Host: parsed.Host, Path: "/mcp"}).String()
	}
	respond(w, http.StatusOK, mcpTokenInventory{Endpoint: endpoint, Tokens: tokens, Projects: projects})
}

func (a *API) issueMCPToken(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	var input struct {
		Name       string   `json:"name"`
		ProjectIDs []string `json:"projectIds"`
		ExpiryDays *int     `json:"expiryDays"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 80 || strings.ContainsAny(input.Name, "\x00\r\n") {
		fail(w, http.StatusBadRequest, "Enter a token name of 1–80 characters")
		return
	}
	if len(input.ProjectIDs) == 0 || len(input.ProjectIDs) > 100 {
		fail(w, http.StatusBadRequest, "Select 1–100 projects")
		return
	}
	for _, id := range input.ProjectIDs {
		if uuid.Validate(id) != nil {
			fail(w, http.StatusBadRequest, "Select existing projects")
			return
		}
	}
	slices.Sort(input.ProjectIDs)
	if len(slices.Compact(slices.Clone(input.ProjectIDs))) != len(input.ProjectIDs) {
		fail(w, http.StatusBadRequest, "Select each project once")
		return
	}
	days := 30
	if input.ExpiryDays != nil {
		days = *input.ExpiryDays
	}
	if days < 1 || days > 365 {
		fail(w, http.StatusBadRequest, "Expiry must be between 1 and 365 days")
		return
	}
	token, secret, err := a.Store.IssueMCPToken(r.Context(), user(r).ID, input.Name, input.ProjectIDs, days)
	if errors.Is(err, db.ErrMCPProject) {
		fail(w, http.StatusBadRequest, "Select existing projects")
		return
	}
	if err != nil {
		a.err(w, err)
		return
	}
	respond(w, http.StatusCreated, struct {
		Token  db.MCPToken `json:"token"`
		Secret string      `json:"secret"`
	}{Token: token, Secret: secret})
}

func (a *API) revokeMCPToken(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	id := chi.URLParam(r, "id")
	if uuid.Validate(id) != nil {
		fail(w, http.StatusBadRequest, "Invalid token ID")
		return
	}
	if err := a.Store.RevokeMCPToken(r.Context(), user(r).ID, id); err != nil {
		a.err(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"ok": true})
}
