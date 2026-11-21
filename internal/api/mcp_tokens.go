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

type mcpIssuedToken struct {
	Token  db.MCPToken `json:"token"`
	Secret string      `json:"secret"`
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
	if !validateMCPProjects(w, input.ProjectIDs) {
		return
	}
	days, ok := mcpExpiryDays(w, input.ExpiryDays)
	if !ok {
		return
	}
	token, secret, err := a.Store.IssueMCPToken(r.Context(), user(r).ID, input.Name, input.ProjectIDs, days)
	if err != nil {
		a.mcpTokenError(w, err)
		return
	}
	respond(w, http.StatusCreated, mcpIssuedToken{Token: token, Secret: secret})
}

func validateMCPProjects(w http.ResponseWriter, projects []string) bool {
	if len(projects) == 0 || len(projects) > 100 {
		fail(w, http.StatusBadRequest, "Select 1–100 projects")
		return false
	}
	for _, id := range projects {
		if uuid.Validate(id) != nil {
			fail(w, http.StatusBadRequest, "Select existing projects")
			return false
		}
	}
	slices.Sort(projects)
	if len(slices.Compact(projects)) != len(projects) {
		fail(w, http.StatusBadRequest, "Select each project once")
		return false
	}
	return true
}

func mcpExpiryDays(w http.ResponseWriter, expiryDays *int) (int, bool) {
	days := 30
	if expiryDays != nil {
		days = *expiryDays
	}
	if days < 1 || days > 365 {
		fail(w, http.StatusBadRequest, "Expiry must be between 1 and 365 days")
		return 0, false
	}
	return days, true
}

func (a *API) mcpTokenError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, db.ErrMCPProject):
		fail(w, http.StatusBadRequest, "Select existing projects")
	case errors.Is(err, db.ErrMCPNoProjects):
		fail(w, http.StatusConflict, "Assign at least one project before recreating the token")
	default:
		a.err(w, err)
	}
}

func (a *API) managedMCPTokenID(w http.ResponseWriter, r *http.Request) string {
	if !a.admin(w, r) {
		return ""
	}
	id := chi.URLParam(r, "id")
	if uuid.Validate(id) != nil {
		fail(w, http.StatusBadRequest, "Invalid token ID")
		return ""
	}
	return id
}

func (a *API) updateMCPTokenAccess(w http.ResponseWriter, r *http.Request) {
	id := a.managedMCPTokenID(w, r)
	if id == "" {
		return
	}
	var input struct {
		ProjectIDs []string `json:"projectIds"`
	}
	if !decode(w, r, &input) || !validateMCPProjects(w, input.ProjectIDs) {
		return
	}
	if err := a.Store.UpdateMCPTokenAccess(r.Context(), user(r).ID, id, input.ProjectIDs); err != nil {
		a.mcpTokenError(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) recreateMCPToken(w http.ResponseWriter, r *http.Request) {
	id := a.managedMCPTokenID(w, r)
	if id == "" {
		return
	}
	var input struct {
		ExpiryDays *int `json:"expiryDays"`
	}
	if !decode(w, r, &input) {
		return
	}
	days, ok := mcpExpiryDays(w, input.ExpiryDays)
	if !ok {
		return
	}
	token, secret, err := a.Store.RecreateMCPToken(r.Context(), user(r).ID, id, days)
	if err != nil {
		a.mcpTokenError(w, err)
		return
	}
	respond(w, http.StatusOK, mcpIssuedToken{Token: token, Secret: secret})
}

func (a *API) revokeMCPToken(w http.ResponseWriter, r *http.Request) {
	id := a.managedMCPTokenID(w, r)
	if id == "" {
		return
	}
	if err := a.Store.RevokeMCPToken(r.Context(), user(r).ID, id); err != nil {
		a.err(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) deleteMCPToken(w http.ResponseWriter, r *http.Request) {
	id := a.managedMCPTokenID(w, r)
	if id == "" {
		return
	}
	if err := a.Store.DeleteMCPToken(r.Context(), user(r).ID, id); err != nil {
		a.err(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"ok": true})
}
