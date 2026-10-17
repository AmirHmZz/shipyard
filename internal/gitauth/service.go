// Package gitauth implements Git provider setup, not Shipyard account login.
package gitauth

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/secure"
)

type Service struct {
	Store                *db.Store
	Origin               string
	HTTP                 *http.Client
	GitHubAPI, GitHubWeb string
}

func New(store *db.Store, origin string) *Service {
	return &Service{store, strings.TrimRight(origin, "/"), providers.HTTPClient(), "https://api.github.com", "https://github.com"}
}

type Instance struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	URL        string `json:"url"`
	ClientID   string `json:"clientId"`
	Configured bool   `json:"configured"`
	Secret     []byte `json:"-"`
}
type storedInstance struct {
	Instance
	EncryptedSecret []byte `json:"encryptedSecret"`
}
type Flow struct {
	User, Session, Kind, Connection, Instance, Name, Verifier string
	Expires                                                   time.Time
}
type Start struct {
	ConnectionID string `json:"connectionId"`
	URL          string `json:"url"`
	Manifest     any    `json:"manifest,omitempty"`
}
type Tokens struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	ExpiresIn    int       `json:"expires_in"`
	ExpiresAt    time.Time `json:"expiresAt"`
}
type Status struct {
	State                   string     `json:"state"`
	Account                 string     `json:"account"`
	WebhookURL              string     `json:"webhookUrl"`
	SigningSecretConfigured bool       `json:"signingSecretConfigured"`
	LastDelivery            *time.Time `json:"lastDelivery"`
}

func (s *Service) request(ctx context.Context, method, endpoint, token string, body, out any) error {
	var input io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		input = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, input)
	if err != nil {
		return errors.New("invalid Git provider endpoint")
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	response, err := s.HTTP.Do(req)
	if err != nil {
		return errors.New("Git provider could not be reached")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("Git provider returned HTTP %d", response.StatusCode)
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(out); err != nil {
		return errors.New("invalid response from Git provider")
	}
	return nil
}
func (s *Service) Instances(ctx context.Context) ([]Instance, error) {
	rows, err := s.Store.Pool.Query(ctx, "SELECT value FROM settings WHERE key LIKE 'gitea-instance:%' ORDER BY key")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Instance{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var v storedInstance
		if err := json.Unmarshal(raw, &v); err != nil {
			return nil, err
		}
		v.Configured = len(v.EncryptedSecret) > 0
		out = append(out, v.Instance)
	}
	return out, rows.Err()
}
func (s *Service) instance(ctx context.Context, id string) (Instance, error) {
	var raw []byte
	if err := s.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", "gitea-instance:"+id).Scan(&raw); err != nil {
		return Instance{}, err
	}
	var v storedInstance
	if err := json.Unmarshal(raw, &v); err != nil {
		return Instance{}, err
	}
	secret, err := s.Store.Vault.Open(v.EncryptedSecret, "gitea-instance:"+id)
	v.Secret = secret
	return v.Instance, err
}
func (s *Service) SaveInstance(ctx context.Context, v Instance, secret string) (Instance, error) {
	u, err := url.Parse(v.URL)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || strings.TrimSpace(v.Name) == "" || strings.TrimSpace(v.ClientID) == "" {
		return Instance{}, errors.New("name, HTTPS instance URL and client ID are required")
	}
	if v.ID == "" {
		v.ID = uuid.NewString()
	} else if _, err := s.instance(ctx, v.ID); err != nil {
		return Instance{}, err
	}
	v.URL = strings.TrimRight(u.String(), "/")
	var encrypted []byte
	if secret == "" {
		old, err := s.instance(ctx, v.ID)
		if err != nil {
			return Instance{}, errors.New("client secret is required")
		}
		secret = string(old.Secret)
	}
	encrypted, err = s.Store.Vault.Seal([]byte(secret), "gitea-instance:"+v.ID)
	if err != nil {
		return Instance{}, err
	}
	v.Secret = nil
	v.Configured = true
	raw, _ := json.Marshal(storedInstance{Instance: v, EncryptedSecret: encrypted})
	_, err = s.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", "gitea-instance:"+v.ID, raw)
	return v, err
}
func (s *Service) putFlow(ctx context.Context, flow Flow) (string, error) {
	state := secure.Token()
	key := "git-setup:" + secure.Hash(state)
	flow.Expires = time.Now().Add(15 * time.Minute)
	raw, _ := json.Marshal(flow)
	encrypted, err := s.Store.Vault.Seal(raw, key)
	if err != nil {
		return "", err
	}
	value, _ := json.Marshal(encrypted)
	_, err = s.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2)", key, value)
	return state, err
}
func (s *Service) consumeFlow(ctx context.Context, state, user, session, kind string) (Flow, error) {
	var flow Flow
	key := "git-setup:" + secure.Hash(state)
	var raw []byte
	tx, err := s.Store.Pool.Begin(ctx)
	if err != nil {
		return flow, err
	}
	defer tx.Rollback(ctx)
	if err = tx.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1 FOR UPDATE", key).Scan(&raw); err != nil {
		return flow, errors.New("setup link expired or was already used")
	}
	var encrypted []byte
	_ = json.Unmarshal(raw, &encrypted)
	plain, err := s.Store.Vault.Open(encrypted, key)
	if err != nil {
		return flow, err
	}
	if json.Unmarshal(plain, &flow) != nil || flow.User != user || !secure.Equal(flow.Session, session) || flow.Kind != kind || time.Now().After(flow.Expires) {
		return Flow{}, errors.New("setup link expired or belongs to another session")
	}
	if _, err = tx.Exec(ctx, "DELETE FROM settings WHERE key=$1", key); err != nil {
		return Flow{}, err
	}
	return flow, tx.Commit(ctx)
}
func (s *Service) saveGit(ctx context.Context, id, name string, spec model.Git, secrets map[string]string) (model.Resource, error) {
	version := 0
	if id != "" {
		old, err := s.Store.Resource(ctx, id)
		if err != nil {
			return model.Resource{}, err
		}
		version = old.Version
	}
	raw, _ := json.Marshal(spec)
	return s.Store.Save(ctx, id, model.ResourceInput{Kind: "git", Name: name, Data: raw, Secrets: secrets, Version: version})
}
func (s *Service) StartGitHub(ctx context.Context, user, session, name, owner string) (Start, error) {
	if !model.HTTPS(s.Origin) {
		return Start{}, errors.New("configure an HTTPS SHIPYARD_ORIGIN before guided setup")
	}
	if strings.TrimSpace(name) == "" {
		return Start{}, errors.New("connection name is required")
	}
	if owner != "" && !regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9-]{0,38}$`).MatchString(owner) {
		return Start{}, errors.New("invalid GitHub organization")
	}
	r, err := s.saveGit(ctx, "", name, model.Git{Provider: "github", Status: "pending"}, nil)
	if err != nil {
		return Start{}, err
	}
	state, err := s.putFlow(ctx, Flow{User: user, Session: session, Kind: "github", Connection: r.ID, Name: name})
	if err != nil {
		return Start{}, err
	}
	endpoint := s.GitHubWeb + "/settings/apps/new"
	if owner != "" {
		endpoint = s.GitHubWeb + "/organizations/" + owner + "/settings/apps/new"
	}
	manifest := map[string]any{"name": "Shipyard-" + r.ID[:8], "url": s.Origin, "public": false, "redirect_url": s.Origin + "/api/v1/git/setup/github/callback", "setup_url": s.Origin + "/api/v1/git/setup/github/install", "hook_attributes": map[string]any{"url": s.Origin + "/api/v1/hooks/" + r.ID, "active": true}, "default_permissions": map[string]string{"contents": "read", "pull_requests": "read"}, "default_events": []string{"push", "pull_request"}}
	return Start{ConnectionID: r.ID, URL: endpoint + "?state=" + url.QueryEscape(state), Manifest: manifest}, nil
}
func (s *Service) GitHubCallback(ctx context.Context, user, session, state, code string) (string, error) {
	flow, err := s.consumeFlow(ctx, state, user, session, "github")
	if err != nil {
		return "", err
	}
	if code == "" {
		return "", errors.New("GitHub setup was cancelled")
	}
	var app struct {
		ID            int64  `json:"id"`
		PEM           string `json:"pem"`
		WebhookSecret string `json:"webhook_secret"`
		Slug          string `json:"slug"`
	}
	if err = s.request(ctx, "POST", s.GitHubAPI+"/app-manifests/"+url.PathEscape(code)+"/conversions", "", nil, &app); err != nil {
		return "", err
	}
	if app.ID <= 0 || app.WebhookSecret == "" || !regexp.MustCompile(`^[a-zA-Z0-9-]+$`).MatchString(app.Slug) {
		return "", errors.New("GitHub did not return valid App credentials")
	}
	if _, err = jwt.ParseRSAPrivateKeyFromPEM([]byte(app.PEM)); err != nil {
		return "", errors.New("GitHub returned an invalid App key")
	}
	_, err = s.saveGit(ctx, flow.Connection, flow.Name, model.Git{Provider: "github", AppID: strconv.FormatInt(app.ID, 10), AppSlug: app.Slug, Status: "installation_required"}, map[string]string{"private_key": app.PEM, "webhook_secret": app.WebhookSecret})
	if err != nil {
		return "", err
	}
	flow.Kind = "github-install"
	next, err := s.putFlow(ctx, flow)
	if err != nil {
		return "", err
	}
	return s.GitHubWeb + "/apps/" + app.Slug + "/installations/new?state=" + url.QueryEscape(next), nil
}
func appJWT(spec model.Git, key string) (string, error) {
	parsed, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(key))
	if err != nil {
		return "", errors.New("invalid GitHub App key")
	}
	now := time.Now()
	return jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.RegisteredClaims{Issuer: spec.AppID, IssuedAt: jwt.NewNumericDate(now.Add(-time.Minute)), ExpiresAt: jwt.NewNumericDate(now.Add(8 * time.Minute))}).SignedString(parsed)
}
func (s *Service) GitHubInstall(ctx context.Context, user, session, state, installation string) error {
	flow, err := s.consumeFlow(ctx, state, user, session, "github-install")
	if err != nil {
		return err
	}
	if _, err = strconv.ParseUint(installation, 10, 64); err != nil {
		return errors.New("invalid installation ID")
	}
	r, err := s.Store.Resource(ctx, flow.Connection)
	if err != nil {
		return err
	}
	spec, _ := model.Decode[model.Git](r)
	secrets, err := s.Store.Secrets(r)
	if err != nil {
		return err
	}
	token, err := appJWT(spec, secrets["private_key"])
	if err != nil {
		return err
	}
	var info struct {
		AppID       int64      `json:"app_id"`
		SuspendedAt *time.Time `json:"suspended_at"`
		Account     struct {
			Login string `json:"login"`
		} `json:"account"`
	}
	if err = s.request(ctx, "GET", s.GitHubAPI+"/app/installations/"+installation, token, nil, &info); err != nil {
		return err
	}
	if strconv.FormatInt(info.AppID, 10) != spec.AppID || info.SuspendedAt != nil {
		return errors.New("installation does not belong to this active GitHub App")
	}
	spec.InstallationID = installation
	spec.Account = info.Account.Login
	spec.Status = "ready"
	_, err = s.saveGit(ctx, r.ID, r.Name, spec, nil)
	return err
}
func (s *Service) StartGitea(ctx context.Context, user, session, name, instanceID, connectionID string) (Start, error) {
	if !model.HTTPS(s.Origin) {
		return Start{}, errors.New("configure an HTTPS SHIPYARD_ORIGIN before guided setup")
	}
	instance, err := s.instance(ctx, instanceID)
	if err != nil {
		return Start{}, err
	}
	var version struct {
		Version string `json:"version"`
	}
	if err = s.request(ctx, "GET", instance.URL+"/api/v1/version", "", nil, &version); err != nil {
		return Start{}, err
	}
	parts := strings.Split(strings.TrimPrefix(version.Version, "v"), ".")
	major, minor := 0, 0
	if len(parts) >= 2 {
		major, _ = strconv.Atoi(parts[0])
		minor, _ = strconv.Atoi(parts[1])
	}
	if major < 1 || (major == 1 && minor < 23) {
		return Start{}, errors.New("Gitea 1.23 or newer is required for scoped OAuth")
	}
	spec := model.Git{Provider: "gitea", URL: instance.URL, InstanceID: instance.ID, AuthMethod: "oauth", Status: "pending"}
	if connectionID != "" {
		old, e := s.Store.Resource(ctx, connectionID)
		if e != nil {
			return Start{}, e
		}
		previous, e := model.Decode[model.Git](old)
		if e != nil || old.Kind != "git" || previous.Provider != "gitea" || previous.InstanceID != instance.ID {
			return Start{}, errors.New("Gitea instance does not match connection")
		}
		name = old.Name
		spec = previous
	}
	if strings.TrimSpace(name) == "" {
		return Start{}, errors.New("connection name is required")
	}
	r, err := s.saveGit(ctx, connectionID, name, spec, nil)
	if err != nil {
		return Start{}, err
	}
	verifier := secure.Token() + secure.Token()
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])
	state, err := s.putFlow(ctx, Flow{User: user, Session: session, Kind: "gitea", Connection: r.ID, Instance: instance.ID, Verifier: verifier})
	if err != nil {
		return Start{}, err
	}
	query := url.Values{"client_id": {instance.ClientID}, "redirect_uri": {s.Origin + "/api/v1/git/setup/gitea/callback"}, "response_type": {"code"}, "scope": {"read:user read:repository"}, "state": {state}, "code_challenge": {challenge}, "code_challenge_method": {"S256"}}
	return Start{ConnectionID: r.ID, URL: instance.URL + "/login/oauth/authorize?" + query.Encode()}, nil
}
func (s *Service) GiteaCallback(ctx context.Context, user, session, state, code string) error {
	flow, err := s.consumeFlow(ctx, state, user, session, "gitea")
	if err != nil {
		return err
	}
	if code == "" {
		return errors.New("Gitea authorization was cancelled")
	}
	instance, err := s.instance(ctx, flow.Instance)
	if err != nil {
		return err
	}
	tokens, err := s.exchange(ctx, instance, map[string]string{"grant_type": "authorization_code", "code": code, "code_verifier": flow.Verifier, "redirect_uri": s.Origin + "/api/v1/git/setup/gitea/callback"})
	if err != nil {
		return err
	}
	var account struct {
		Login string `json:"login"`
	}
	if err = s.request(ctx, "GET", instance.URL+"/api/v1/user", tokens.AccessToken, nil, &account); err != nil {
		return err
	}
	r, err := s.Store.Resource(ctx, flow.Connection)
	if err != nil {
		return err
	}
	spec, _ := model.Decode[model.Git](r)
	spec.Status = "ready"
	spec.Account = account.Login
	raw, _ := json.Marshal(tokens)
	_, err = s.saveGit(ctx, r.ID, r.Name, spec, map[string]string{"oauth_token": string(raw)})
	return err
}
func (s *Service) exchange(ctx context.Context, instance Instance, params map[string]string) (Tokens, error) {
	params["client_id"] = instance.ClientID
	params["client_secret"] = string(instance.Secret)
	var tokens Tokens
	err := s.request(ctx, "POST", instance.URL+"/login/oauth/access_token", "", params, &tokens)
	if err != nil {
		return tokens, err
	}
	if tokens.AccessToken == "" || tokens.ExpiresIn <= 0 {
		return tokens, errors.New("Gitea authorization requires reconnection")
	}
	tokens.ExpiresAt = time.Now().Add(time.Duration(tokens.ExpiresIn) * time.Second)
	return tokens, nil
}
func (s *Service) lock(ctx context.Context, id string) (func(), error) {
	for {
		conn, err := s.Store.Pool.Acquire(ctx)
		if err != nil {
			return nil, err
		}
		var acquired bool
		err = conn.QueryRow(ctx, "SELECT pg_try_advisory_lock(hashtextextended($1,0))", "git:"+id).Scan(&acquired)
		if err != nil {
			conn.Release()
			return nil, err
		}
		if acquired {
			return func() {
				cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
				defer cancel()
				_, _ = conn.Exec(cleanup, "SELECT pg_advisory_unlock(hashtextextended($1,0))", "git:"+id)
				conn.Release()
			}, nil
		}
		conn.Release()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(25 * time.Millisecond):
		}
	}
}
func (s *Service) Token(ctx context.Context, id string) (string, error) {
	unlock, err := s.lock(ctx, id)
	if err != nil {
		return "", err
	}
	defer unlock()
	r, err := s.Store.Resource(ctx, id)
	if err != nil {
		return "", err
	}
	spec, _ := model.Decode[model.Git](r)
	if spec.Status == "reconnect_required" {
		return "", errors.New("reconnect the Gitea connection in Integrations")
	}
	secrets, err := s.Store.Secrets(r)
	if err != nil {
		return "", err
	}
	var tokens Tokens
	if json.Unmarshal([]byte(secrets["oauth_token"]), &tokens) != nil {
		return "", errors.New("reconnect the Gitea connection in Integrations")
	}
	if time.Until(tokens.ExpiresAt) > time.Minute {
		return tokens.AccessToken, nil
	}
	instance, err := s.instance(ctx, spec.InstanceID)
	if err != nil {
		return "", err
	}
	next, err := s.exchange(ctx, instance, map[string]string{"grant_type": "refresh_token", "refresh_token": tokens.RefreshToken})
	if err != nil {
		spec.Status = "reconnect_required"
		_, _ = s.saveGit(ctx, r.ID, r.Name, spec, nil)
		return "", errors.New("Gitea token refresh failed; reconnect in Integrations")
	}
	if next.RefreshToken == "" {
		next.RefreshToken = tokens.RefreshToken
	}
	spec.Status = "ready"
	raw, _ := json.Marshal(next)
	if _, err = s.saveGit(ctx, r.ID, r.Name, spec, map[string]string{"oauth_token": string(raw)}); err != nil {
		return "", err
	}
	return next.AccessToken, nil
}
func (s *Service) Client(ctx context.Context, r model.Resource) (*providers.GitClient, error) {
	spec, err := model.Decode[model.Git](r)
	if err != nil {
		return nil, err
	}
	secrets, err := s.Store.Secrets(r)
	if err != nil {
		return nil, err
	}
	client := providers.NewGit(spec, secrets)
	client.HTTP = s.HTTP
	if spec.Provider == "github" {
		client.API = s.GitHubAPI
	}
	if spec.Provider == "gitea" && spec.AuthMethod == "oauth" {
		client.TokenFunc = func(ctx context.Context) (string, error) { return s.Token(ctx, r.ID) }
		client.AuthFailed = func(ctx context.Context) {
			unlock, err := s.lock(ctx, r.ID)
			if err != nil {
				return
			}
			defer unlock()
			current, err := s.Store.Resource(ctx, r.ID)
			if err != nil {
				return
			}
			spec, _ := model.Decode[model.Git](current)
			spec.Status = "reconnect_required"
			_, _ = s.saveGit(ctx, current.ID, current.Name, spec, nil)
		}
	}
	return client, nil
}
func (s *Service) Status(ctx context.Context, r model.Resource) (Status, error) {
	spec, err := model.Decode[model.Git](r)
	if err != nil {
		return Status{}, err
	}
	secrets, err := s.Store.Secrets(r)
	if err != nil {
		return Status{}, err
	}
	status := Status{State: spec.Status, Account: spec.Account, WebhookURL: s.Origin + "/api/v1/hooks/" + r.ID, SigningSecretConfigured: secrets["webhook_secret"] != ""}
	if status.State == "" {
		status.State = "manual"
	}
	err = s.Store.Pool.QueryRow(ctx, "SELECT max(created_at) FROM webhook_deliveries WHERE provider_id=$1", r.ID).Scan(&status.LastDelivery)
	return status, err
}
func (s *Service) SigningSecret(ctx context.Context, r model.Resource) (string, error) {
	unlock, err := s.lock(ctx, r.ID)
	if err != nil {
		return "", err
	}
	defer unlock()
	r, err = s.Store.Resource(ctx, r.ID)
	if err != nil {
		return "", err
	}
	spec, _ := model.Decode[model.Git](r)
	if spec.Provider != "gitea" {
		return "", errors.New("manage GitHub webhook secrets in the GitHub App settings")
	}
	secret := secure.Token()
	_, err = s.saveGit(ctx, r.ID, r.Name, spec, map[string]string{"webhook_secret": secret})
	return secret, err
}
