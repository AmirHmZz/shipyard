package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"shipyard/internal/model"
	"shipyard/internal/secure"
)

func TestGitSetupAdminCSRFAndWriteOnlySecrets(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	makeSession := func(admin bool) string {
		id, token := uuid.NewString(), secure.Token()
		_, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'test','disabled',$3)", id, id+"@test.invalid", admin)
		if err != nil {
			t.Fatal(err)
		}
		_, err = a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id)
		if err != nil {
			t.Fatal(err)
		}
		return token
	}
	admin, member := makeSession(true), makeSession(false)
	var callbackCookie *http.Cookie
	request := func(method, path, body, token, csrf string) (int, string) {
		req, _ := http.NewRequest(method, server.URL+"/api/v1"+path, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		for _, cookie := range res.Cookies() {
			if cookie.Name == "shipyard_session" {
				callbackCookie = cookie
			}
		}
		raw, _ := io.ReadAll(res.Body)
		return res.StatusCode, string(raw)
	}
	for _, v := range []struct{ method, path string }{{"GET", "/git/setup/config"}, {"GET", "/git/gitea/instances"}, {"PUT", "/git/gitea/instances"}, {"POST", "/git/setup/start"}, {"GET", "/git/setup/gitea/callback"}} {
		if code, _ := request(v.method, v.path, `{}`, member, "csrf"); code != 403 {
			t.Fatal(v, code)
		}
	}
	if code, _ := request("PUT", "/git/gitea/instances", `{}`, admin, ""); code != 403 {
		t.Fatal("CSRF bypass", code)
	}
	body := `{"name":"Gitea","url":"https://git.example.com","clientId":"id","clientSecret":"private-client-secret"}`
	if code, raw := request("PUT", "/git/gitea/instances", body, admin, "csrf"); code != 200 || strings.Contains(raw, "private-client-secret") {
		t.Fatal(code, raw)
	}
	if code, raw := request("GET", "/git/gitea/instances", "", admin, ""); code != 200 || strings.Contains(raw, "private-client-secret") {
		t.Fatal(code, raw)
	}
	raw, _ := json.Marshal(model.Git{Provider: "gitea", URL: "https://git.example.com"})
	r, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: "git", Name: "Manual", Data: raw})
	if err != nil {
		t.Fatal(err)
	}
	if code, _ := request("POST", "/git/"+r.ID+"/webhook-secret", `{}`, member, "csrf"); code != 403 {
		t.Fatal(code)
	}
	code, result := request("POST", "/git/"+r.ID+"/webhook-secret", `{}`, admin, "csrf")
	if code != 200 {
		t.Fatal(code, result)
	}
	var signing struct {
		Secret string `json:"secret"`
	}
	_ = json.Unmarshal([]byte(result), &signing)
	if signing.Secret == "" {
		t.Fatal("missing generated secret")
	}
	code, result = request("GET", "/git/"+r.ID+"/setup", "", admin, "")
	if code != 200 || strings.Contains(result, signing.Secret) || !strings.Contains(result, `"signingSecretConfigured":true`) {
		t.Fatal(code, result)
	}
	code, result = request("POST", "/git/setup/start", `{"name":"GitHub","provider":"github"}`, admin, "csrf")
	if code != 200 || strings.Contains(result, "private_key") {
		t.Fatal(code, result)
	}
	if callbackCookie == nil || callbackCookie.Value != admin || callbackCookie.SameSite != http.SameSiteLaxMode || !callbackCookie.Secure || !callbackCookie.HttpOnly {
		t.Fatal("callback cookie must preserve and protect session", callbackCookie)
	}
}
