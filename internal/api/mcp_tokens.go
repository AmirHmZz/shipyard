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
	actor := user(r).ID
	tokens, err := a.Store.MCPTokens(r.Context(), actor)
	if err != nil {
		a.err(w, err)
		return
	}
	projects, err := a.Store.MCPProjects(r.Context(), actor)
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
	var input struct {
		Name               string                   `json:"name"`
		ProjectIDs         []string                 `json:"projectIds"`
		ProjectPermissions db.MCPProjectPermissions `json:"projectPermissions"`
		ExpiryDays         *int                     `json:"expiryDays"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 80 || strings.ContainsAny(input.Name, "\x00\r\n") {
		fail(w, http.StatusBadRequest, "Enter a token name of 1–80 characters")
		return
	}
	if !validateMCPProjects(w, input.ProjectIDs) || !validateMCPPermissions(w, input.ProjectIDs, input.ProjectPermissions) {
		return
	}
	days, ok := mcpExpiryDays(w, input.ExpiryDays)
	if !ok {
		return
	}
	token, secret, err := a.Store.IssueMCPTokenWithPermissions(r.Context(), user(r).ID, input.Name, input.ProjectIDs, input.ProjectPermissions, days)
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

func validateMCPPermissions(w http.ResponseWriter, projects []string, permissions db.MCPProjectPermissions) bool {
	for project, grants := range permissions {
		if !slices.Contains(projects, project) || len(grants) == 0 {
			fail(w, 400, "Assign permissions to selected projects")
			return false
		}
		seen := make(map[string]bool, len(grants))
		for _, grant := range grants {
			if seen[grant] || !slices.Contains([]string{db.MCPConfigure, db.MCPLifecycle, db.MCPFreshDeploy, db.MCPCleanup}, grant) {
				fail(w, 400, "Select each supported permission once per project")
				return false
			}
			seen[grant] = true
		}
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
		fail(w, http.StatusBadRequest, "Select projects you can access")
	case errors.Is(err, db.ErrMCPNoProjects):
		fail(w, http.StatusConflict, "Select at least one accessible project before recreating the token")
	default:
		a.err(w, err)
	}
}

func managedMCPTokenID(w http.ResponseWriter, r *http.Request) string {
	id := chi.URLParam(r, "id")
	if uuid.Validate(id) != nil {
		fail(w, http.StatusBadRequest, "Invalid token ID")
		return ""
	}
	return id
}

func (a *API) updateMCPTokenAccess(w http.ResponseWriter, r *http.Request) {
	id := managedMCPTokenID(w, r)
	if id == "" {
		return
	}
	var input struct {
		ProjectIDs         []string                 `json:"projectIds"`
		ProjectPermissions db.MCPProjectPermissions `json:"projectPermissions"`
	}
	if !decode(w, r, &input) || !validateMCPProjects(w, input.ProjectIDs) || !validateMCPPermissions(w, input.ProjectIDs, input.ProjectPermissions) {
		return
	}
	if err := a.Store.UpdateMCPTokenAccess(r.Context(), user(r).ID, id, input.ProjectIDs, input.ProjectPermissions); err != nil {
		a.mcpTokenError(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) recreateMCPToken(w http.ResponseWriter, r *http.Request) {
	id := managedMCPTokenID(w, r)
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
	id := managedMCPTokenID(w, r)
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
	id := managedMCPTokenID(w, r)
	if id == "" {
		return
	}
	if err := a.Store.DeleteMCPToken(r.Context(), user(r).ID, id); err != nil {
		a.err(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"ok": true})
}
