package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"github.com/google/uuid"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"shipyard/internal/control"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/secure"
	"shipyard/internal/testdb"
	"strings"
	"testing"
)

func testAPI(t *testing.T) (*API, *httptest.Server) {
	t.Helper()
	url := testdb.URL(t)
	vault, _ := secure.New(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	s, e := db.Open(context.Background(), url, vault)
	if e != nil {
		t.Fatal(e)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	c := &control.Controller{Store: s, DataDir: t.TempDir(), Logger: logger}
	a := &API{Store: s, Control: c, Origin: "https://shipyard.test", Logger: logger, BootstrapToken: "test-bootstrap-token"}
	server := httptest.NewServer(a.Router())
	t.Cleanup(server.Close)
	t.Cleanup(s.Pool.Close)
	return a, server
}
func TestSessionCSRFAndViewerBoundaries(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	uid := uuid.NewString()
	_, e := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password) VALUES($1,$2,'viewer','disabled')", uid, uid+"@test.invalid")
	if e != nil {
		t.Fatal(e)
	}
	session := secure.Token()
	csrf := secure.Token()
	_, _ = a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", secure.Hash(session), uid, csrf)
	request := func(method, path, body, token, origin string) *http.Response {
		req, _ := http.NewRequest(method, server.URL+path, bytes.NewBufferString(body))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: session})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", token)
		req.Header.Set("Origin", origin)
		res, e := http.DefaultClient.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() { res.Body.Close() })
		return res
	}
	if res := request("POST", "/api/v1/resources", `{"kind":"team","name":"steal","data":{}}`, "", "https://shipyard.test"); res.StatusCode != 403 {
		t.Fatal("CSRF bypass", res.StatusCode)
	}
	if res := request("POST", "/api/v1/resources", `{"kind":"team","name":"steal","data":{}}`, csrf, "https://evil.test"); res.StatusCode != 403 {
		t.Fatal("origin bypass", res.StatusCode)
	}
	if res := request("POST", "/api/v1/resources", `{"kind":"server","name":"steal","data":{}}`, csrf, "https://shipyard.test"); res.StatusCode != 403 {
		t.Fatal("non-admin created infrastructure", res.StatusCode)
	}
	if res := request("GET", "/api/v1/resources", "", csrf, ""); res.StatusCode != 200 {
		t.Fatal(res.StatusCode)
	}
}
func TestWebhookRejectedBeforeQueue(t *testing.T) {
	a, server := testAPI(t)
	git, e := a.Store.Save(context.Background(), "", model.ResourceInput{Kind: "git", Name: "GitHub", Data: json.RawMessage(`{"provider":"github"}`), Secrets: map[string]string{"webhook_secret": "correct-secret"}})
	if e != nil {
		t.Fatal(e)
	}
	req, _ := http.NewRequest("POST", server.URL+"/api/v1/hooks/"+git.ID, bytes.NewBufferString(`{"after":"bad"}`))
	req.Header.Set("X-GitHub-Delivery", "one")
	req.Header.Set("X-Hub-Signature-256", "sha256=0000")
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	if res.StatusCode != 401 {
		t.Fatal("forged webhook accepted")
	}
	var n int
	_ = a.Store.Pool.QueryRow(context.Background(), "SELECT count(*) FROM webhook_deliveries WHERE provider_id=$1", git.ID).Scan(&n)
	if n != 0 {
		t.Fatal("forged webhook recorded")
	}
}

func TestStreamSessionRevalidation(t *testing.T) {
	a, _ := testAPI(t)
	ctx := context.Background()
	id := uuid.NewString()
	_, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'admin','disabled',true)", id, id+"@test.invalid")
	if err != nil {
		t.Fatal(err)
	}
	resource, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: "server", Name: "private server", Data: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	session := secure.Token()
	_, err = a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(session), id)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("GET", "/", nil)
	r.AddCookie(&http.Cookie{Name: "shipyard_session", Value: session})
	if !a.streamAccess(r, resource, true) {
		t.Fatal("active administrator session rejected")
	}
	_, _ = a.Store.Pool.Exec(ctx, "UPDATE users SET admin=false WHERE id=$1", id)
	if a.streamAccess(r, resource, true) {
		t.Fatal("cached administrator role survived demotion")
	}
	_, _ = a.Store.Pool.Exec(ctx, "UPDATE users SET admin=true WHERE id=$1", id)
	_, _ = a.Store.Pool.Exec(ctx, "DELETE FROM sessions WHERE token=$1", secure.Hash(session))
	if a.streamAccess(r, resource, true) {
		t.Fatal("logged-out session retained stream access")
	}
}

func TestSignedWebhookReplayIsAtomicAndDropsLegacySecret(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	git, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: "git", Name: "Gitea", Data: json.RawMessage(`{"provider":"gitea","url":"https://git.invalid"}`), Secrets: map[string]string{"webhook_secret": "test-signing-secret"}})
	if err != nil {
		t.Fatal(err)
	}
	body := `{"secret":"test-signing-secret","ref":"refs/heads/main","after":"` + strings.Repeat("a", 40) + `","repository":{"full_name":"owner/repo"}}`
	mac := hmac.New(sha256.New, []byte("test-signing-secret"))
	mac.Write([]byte(body))
	for i := 0; i < 2; i++ {
		req, _ := http.NewRequest("POST", server.URL+"/api/v1/hooks/"+git.ID, strings.NewReader(body))
		req.Header.Set("X-Gitea-Delivery", "same-delivery")
		req.Header.Set("X-Gitea-Event", "push")
		req.Header.Set("X-Gitea-Signature", hex.EncodeToString(mac.Sum(nil)))
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 202 {
			t.Fatal("signed webhook rejected", res.StatusCode)
		}
	}
	var count int
	var payload []byte
	_ = a.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE kind='git-event'").Scan(&count)
	if count != 1 {
		t.Fatal("webhook replay duplicated the durable job", count)
	}
	_ = a.Store.Pool.QueryRow(ctx, "SELECT payload FROM jobs WHERE kind='git-event'").Scan(&payload)
	if strings.Contains(string(payload), "test-signing-secret") {
		t.Fatal("legacy webhook credential persisted in plaintext")
	}
}

func TestCompletedDeploymentStreamsAllRetainedLogBatches(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	app, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: "application", Name: "test", Data: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	uid, token, deployment := uuid.NewString(), secure.Token(), uuid.NewString()
	if _, err = a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'Admin','disabled',true)", uid, uid+"@test.invalid"); err != nil {
		t.Fatal(err)
	}
	if _, err = a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), uid); err != nil {
		t.Fatal(err)
	}
	if _, err = a.Store.Pool.Exec(ctx, "INSERT INTO deployments(id,app_id,state,snapshot) VALUES($1,$2,'healthy',$3)", deployment, app.ID, []byte("snapshot")); err != nil {
		t.Fatal(err)
	}
	if _, err = a.Store.Pool.Exec(ctx, "INSERT INTO events(deployment_id,message) SELECT $1,'line-'||n FROM generate_series(1,1001) n", deployment); err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequest("GET", server.URL+"/api/v1/deployments/"+deployment+"/events", nil)
	req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(string(body), "event: log\n") != 1001 {
		t.Fatal("completed deployment logs were truncated at a batch boundary")
	}
	if strings.Index(string(body), "line-1001") > strings.Index(string(body), "event: status") {
		t.Fatal("completion was announced before logs drained")
	}
}

func TestAdministratorCannotDisableLastAdministrator(t *testing.T) {
	a, server := testAPI(t)
	id := uuid.NewString()
	token := secure.Token()
	_, err := a.Store.Pool.Exec(context.Background(), "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'Admin','disabled',true)", id, id+"@test.invalid")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = a.Store.Pool.Exec(context.Background(), "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id)
	req, _ := http.NewRequest("PUT", server.URL+"/api/v1/users/"+id, bytes.NewBufferString(`{"admin":true,"disabled":true}`))
	req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", "csrf")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 409 {
		t.Fatal("last administrator could be disabled", res.StatusCode)
	}
	_, _ = a.Store.Pool.Exec(context.Background(), "UPDATE users SET disabled=true WHERE id=$1", id)
	req, _ = http.NewRequest("GET", server.URL+"/api/v1/auth/me", nil)
	req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
	res2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res2.Body.Close()
	if res2.StatusCode != 401 {
		t.Fatal("disabled user retained access", res2.StatusCode)
	}
}
