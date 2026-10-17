package api

import (
	"context"
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"
	"shipyard/internal/gitauth"
	"shipyard/internal/model"
	"shipyard/internal/secure"
)

func (a *API) gitAuth() *gitauth.Service {
	if a.GitAuth != nil {
		return a.GitAuth
	}
	return gitauth.New(a.Store, a.canonicalOrigin(context.Background()))
}
func sessionHash(r *http.Request) string {
	cookie, err := r.Cookie("shipyard_session")
	if err != nil {
		return ""
	}
	return secure.Hash(cookie.Value)
}
func (a *API) gitSetupStart(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	var input struct {
		Name       string `json:"name"`
		Provider   string `json:"provider"`
		Owner      string `json:"owner"`
		InstanceID string `json:"instanceId"`
	}
	if !decode(w, r, &input) {
		return
	}
	var result gitauth.Start
	var err error
	if input.Provider == "github" {
		result, err = a.gitAuth().StartGitHub(r.Context(), user(r).ID, sessionHash(r), input.Name, input.Owner)
	} else if input.Provider == "gitea" {
		result, err = a.gitAuth().StartGitea(r.Context(), user(r).ID, sessionHash(r), input.Name, input.InstanceID, "")
	} else {
		fail(w, 400, "Unsupported Git provider")
		return
	}
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "git.setup_started", result.ConnectionID, "", nil)
	a.gitRedirectCookie(w, r)
	respond(w, 200, result)
}
func (a *API) gitInstances(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	if r.Method == "GET" {
		instances, err := a.gitAuth().Instances(r.Context())
		if err != nil {
			a.err(w, err)
			return
		}
		respond(w, 200, instances)
		return
	}
	var input struct {
		ID           string `json:"id"`
		Name         string `json:"name"`
		URL          string `json:"url"`
		ClientID     string `json:"clientId"`
		ClientSecret string `json:"clientSecret"`
	}
	if !decode(w, r, &input) {
		return
	}
	v, err := a.gitAuth().SaveInstance(r.Context(), gitauth.Instance{ID: input.ID, Name: input.Name, URL: input.URL, ClientID: input.ClientID}, input.ClientSecret)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "git.gitea_instance_saved", v.ID, "", nil)
	respond(w, 200, v)
}
func (a *API) gitSetupStatus(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	if v.Kind != "git" {
		fail(w, 400, "Git connection required")
		return
	}
	status, err := a.gitAuth().Status(r.Context(), v)
	if err != nil {
		a.err(w, err)
		return
	}
	respond(w, 200, status)
}
func (a *API) gitReconnect(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	spec, err := model.Decode[model.Git](v)
	if err == nil && v.Kind == "git" && spec.Provider == "github" {
		result, err := a.gitAuth().ResumeGitHub(r.Context(), user(r).ID, sessionHash(r), v)
		if err != nil {
			fail(w, 400, err.Error())
			return
		}
		a.gitRedirectCookie(w, r)
		respond(w, 200, result)
		return
	}
	if err != nil || v.Kind != "git" || spec.Provider != "gitea" || spec.AuthMethod != "oauth" {
		fail(w, 400, "Reconnect is available for Gitea OAuth connections")
		return
	}
	result, err := a.gitAuth().StartGitea(r.Context(), user(r).ID, sessionHash(r), v.Name, spec.InstanceID, v.ID)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	a.gitRedirectCookie(w, r)
	respond(w, 200, result)
}

// Refresh cookie attributes before leaving Shipyard, preserving the same session
// and its database expiry. Old Strict cookies otherwise disappear on callbacks.
func (a *API) gitRedirectCookie(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("shipyard_session"); err == nil {
		http.SetCookie(w, &http.Cookie{Name: "shipyard_session", Value: cookie.Value, Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, MaxAge: 7 * 86400})
	}
}
func (a *API) gitSigningSecret(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	v, ok := a.get(w, r, true)
	if !ok {
		return
	}
	if v.Kind != "git" {
		fail(w, 400, "Git connection required")
		return
	}
	secret, err := a.gitAuth().SigningSecret(r.Context(), v)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	_ = a.Store.Audit(r.Context(), user(r).ID, "git.webhook_secret_replaced", v.ID, "", nil)
	respond(w, 200, map[string]string{"secret": secret})
}
func (a *API) gitCallback(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	service := a.gitAuth()
	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	kind := chi.URLParam(r, "provider")
	var err error
	if kind == "github" {
		var next string
		next, err = service.GitHubCallback(r.Context(), user(r).ID, sessionHash(r), state, code)
		if err == nil {
			http.Redirect(w, r, next, http.StatusSeeOther)
			return
		}
	} else if kind == "gitea" {
		err = service.GiteaCallback(r.Context(), user(r).ID, sessionHash(r), state, code)
	} else {
		fail(w, 400, "Unsupported Git provider")
		return
	}
	a.finishGitCallback(w, r, err)
}
func (a *API) githubInstall(w http.ResponseWriter, r *http.Request) {
	if !a.admin(w, r) {
		return
	}
	err := a.gitAuth().GitHubInstall(r.Context(), user(r).ID, sessionHash(r), r.URL.Query().Get("state"), r.URL.Query().Get("installation_id"))
	a.finishGitCallback(w, r, err)
}
func (a *API) finishGitCallback(w http.ResponseWriter, r *http.Request, err error) {
	query := url.Values{}
	if err != nil {
		query.Set("gitError", err.Error())
		_ = a.Store.Audit(r.Context(), user(r).ID, "git.authorization_failed", "", "", nil)
	} else {
		query.Set("gitConnected", "1")
		_ = a.Store.Audit(r.Context(), user(r).ID, "git.authorized", "", "", nil)
	}
	http.Redirect(w, r, "/integrations?"+query.Encode(), http.StatusSeeOther)
}
