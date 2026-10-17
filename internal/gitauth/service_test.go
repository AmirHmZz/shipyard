package gitauth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/secure"
	"shipyard/internal/testdb"
)

func testService(t *testing.T) *Service {
	t.Helper()
	vault, _ := secure.New(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	store, err := db.Open(context.Background(), testdb.URL(t), vault)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(store.Pool.Close)
	return New(store, "https://shipyard.test")
}
func stateFrom(t *testing.T, endpoint string) string {
	t.Helper()
	u, err := url.Parse(endpoint)
	if err != nil {
		t.Fatal(err)
	}
	return u.Query().Get("state")
}
func TestGitHubManifestSessionReplayAndInstallation(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	private := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	appID := int64(100)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/app-manifests/code/conversions":
			_ = json.NewEncoder(w).Encode(map[string]any{"id": 100, "pem": private, "webhook_secret": "signing-secret", "slug": "shipyard-test"})
		case "/app/installations/7":
			if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
				t.Error("missing app JWT")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"app_id": appID, "account": map[string]string{"login": "owner"}})
		default:
			t.Error("unexpected provider request", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	s.GitHubAPI = server.URL
	start, err := s.StartGitHub(ctx, "admin", "session", "Code", "my-org")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(start.URL, "/organizations/my-org/") {
		t.Fatal(start)
	}
	manifest, _ := json.Marshal(start.Manifest)
	if !strings.Contains(string(manifest), "pull_requests") || strings.Contains(string(manifest), "private_key") {
		t.Fatal(string(manifest))
	}
	state := stateFrom(t, start.URL)
	if _, err = s.GitHubCallback(ctx, "admin", "other-session", state, "code"); err == nil {
		t.Fatal("cross-session callback accepted")
	}
	next, err := s.GitHubCallback(ctx, "admin", "session", state, "code")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.GitHubCallback(ctx, "admin", "session", state, "code"); err == nil {
		t.Fatal("replayed manifest callback")
	}
	appID = 999
	if err = s.GitHubInstall(ctx, "admin", "session", stateFrom(t, next), "7"); err == nil {
		t.Fatal("foreign installation accepted")
	}
	flow := Flow{User: "admin", Session: "session", Kind: "github-install", Connection: start.ConnectionID}
	installState, err := s.putFlow(ctx, flow)
	if err != nil {
		t.Fatal(err)
	}
	appID = 100
	if err = s.GitHubInstall(ctx, "admin", "session", installState, "7"); err != nil {
		t.Fatal(err)
	}
	r, _ := s.Store.Resource(ctx, start.ConnectionID)
	spec, _ := model.Decode[model.Git](r)
	if spec.Status != "ready" || spec.InstallationID != "7" {
		t.Fatal(spec)
	}
	public, _ := json.Marshal(s.Store.Public(r))
	if strings.Contains(string(public), "BEGIN RSA") || strings.Contains(string(public), "signing-secret") {
		t.Fatal("credentials exposed")
	}
	expired, _ := s.putFlow(ctx, Flow{User: "admin", Session: "session", Kind: "github"})
	keyName := "git-setup:" + secure.Hash(expired)
	f := Flow{User: "admin", Session: "session", Kind: "github", Expires: time.Now().Add(-time.Minute)}
	raw, _ := json.Marshal(f)
	encrypted, _ := s.Store.Vault.Seal(raw, keyName)
	raw, _ = json.Marshal(encrypted)
	_, _ = s.Store.Pool.Exec(ctx, "UPDATE settings SET value=$2 WHERE key=$1", keyName, raw)
	if _, err = s.consumeFlow(ctx, expired, "admin", "session", "github"); err == nil {
		t.Fatal("expired flow accepted")
	}
}
func TestGiteaOAuthRefreshReconnectAndManualHooks(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	var refreshes atomic.Int32
	var revoked atomic.Bool
	var apiRevoked atomic.Bool
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/version":
			_ = json.NewEncoder(w).Encode(map[string]string{"version": "1.23.8"})
		case "/login/oauth/access_token":
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["client_secret"] != "client-secret" {
				t.Error("missing client credential")
			}
			if body["grant_type"] == "refresh_token" {
				refreshes.Add(1)
				if revoked.Load() {
					http.Error(w, "revoked", 400)
					return
				}
			} else if body["code_verifier"] == "" {
				t.Error("missing PKCE verifier")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "access-secret", "refresh_token": "refresh-secret", "expires_in": 3600})
		case "/api/v1/user":
			if r.Header.Get("Authorization") != "Bearer access-secret" {
				t.Error("wrong OAuth authentication")
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"login": "owner"})
		case "/api/v1/user/repos":
			if apiRevoked.Load() {
				http.Error(w, "revoked", 401)
				return
			}
			if r.Header.Get("Authorization") != "Bearer access-secret" {
				t.Error("OAuth API requests must use bearer tokens")
			}
			_ = json.NewEncoder(w).Encode([]any{})
		default:
			t.Error("unexpected API request (webhooks must remain manual)", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	s.HTTP = server.Client()
	instance, err := s.SaveInstance(ctx, Instance{Name: "Gitea", URL: server.URL, ClientID: "client"}, "client-secret")
	if err != nil {
		t.Fatal(err)
	}
	list, err := s.Instances(ctx)
	if err != nil || len(list) != 1 || len(list[0].Secret) > 0 {
		t.Fatal(list, err)
	}
	start, err := s.StartGitea(ctx, "admin", "session", "Gitea", instance.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(start.URL)
	if u.Query().Get("scope") != "read:user read:repository" || u.Query().Get("code_challenge_method") != "S256" {
		t.Fatal(u)
	}
	if err = s.GiteaCallback(ctx, "admin", "session", stateFrom(t, start.URL), "code"); err != nil {
		t.Fatal(err)
	}
	if err = s.GiteaCallback(ctx, "admin", "session", stateFrom(t, start.URL), "code"); err == nil {
		t.Fatal("callback replay accepted")
	}
	r, _ := s.Store.Resource(ctx, start.ConnectionID)
	signing, err := s.SigningSecret(ctx, r)
	if err != nil {
		t.Fatal(err)
	}
	expire := func() {
		r, _ = s.Store.Resource(ctx, r.ID)
		spec, _ := model.Decode[model.Git](r)
		tokens, _ := json.Marshal(Tokens{AccessToken: "expired", RefreshToken: "refresh-secret", ExpiresAt: time.Now().Add(-time.Minute)})
		if _, err := s.saveGit(ctx, r.ID, r.Name, spec, map[string]string{"oauth_token": string(tokens)}); err != nil {
			t.Fatal(err)
		}
	}
	expire()
	var wg sync.WaitGroup
	for range 32 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			token, err := s.Token(ctx, r.ID)
			if err != nil || token != "access-secret" {
				t.Error(token, err)
			}
		}()
	}
	wg.Wait()
	if refreshes.Load() != 1 {
		t.Fatal("refresh not serialized", refreshes.Load())
	}
	client, err := s.Client(ctx, r)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = client.Repositories(ctx); err != nil {
		t.Fatal(err)
	}
	apiRevoked.Store(true)
	if _, err = client.Repositories(ctx); err == nil {
		t.Fatal("revoked access token accepted")
	}
	if _, err = s.Token(ctx, r.ID); err == nil {
		t.Fatal("revoked authorization reused")
	}
	apiRevoked.Store(false)
	status, err := s.Status(ctx, r)
	if err != nil || !status.SigningSecretConfigured || status.LastDelivery != nil {
		t.Fatal(status, err)
	}
	start, err = s.StartGitea(ctx, "admin", "session", "", instance.ID, r.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.GiteaCallback(ctx, "admin", "session", stateFrom(t, start.URL), "code"); err != nil {
		t.Fatal(err)
	}
	r, _ = s.Store.Resource(ctx, r.ID)
	secrets, _ := s.Store.Secrets(r)
	if secrets["webhook_secret"] != signing {
		t.Fatal("reconnect rotated signing secret")
	}
	public, _ := json.Marshal(s.Store.Public(r))
	if strings.Contains(string(public), "access-secret") || strings.Contains(string(public), signing) {
		t.Fatal("credentials exposed")
	}
	expire()
	revoked.Store(true)
	if _, err = s.Token(ctx, r.ID); err == nil {
		t.Fatal("revoked token accepted")
	}
	r, _ = s.Store.Resource(ctx, r.ID)
	status, _ = s.Status(ctx, r)
	if status.State != "reconnect_required" {
		t.Fatal(status)
	}
}
