package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"shipyard/internal/gitauth"
	"shipyard/internal/model"
	"shipyard/internal/secure"
)

func TestGitTeamSetupAndDeploymentPermissions(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := a.Store.Pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	save := func(kind, team, parent string, data json.RawMessage) model.Resource {
		t.Helper()
		r, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: kind, Name: kind, TeamID: team, ParentID: parent, Data: data})
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	session := func(id string, admin bool) string {
		t.Helper()
		token := secure.Token()
		exec("INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,$1,'disabled',$3)", id, id+"@test.invalid", admin)
		exec("INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id)
		return token
	}
	owner, operator, outsider, admin := session("team-owner", false), session("operator", false), session("outsider", false), session("admin", true)
	team := save("team", "", "", json.RawMessage(`{}`))
	other := save("team", "", "", json.RawMessage(`{}`))
	project := save("project", team.ID, team.ID, json.RawMessage(`{}`))
	env := save("environment", team.ID, project.ID, json.RawMessage(`{}`))
	otherProject := save("project", other.ID, other.ID, json.RawMessage(`{}`))
	otherEnv := save("environment", other.ID, otherProject.ID, json.RawMessage(`{}`))
	host := save("server", "", "", json.RawMessage(`{}`))
	shared := save("git", "", "", json.RawMessage(`{"provider":"github"}`))
	exec("INSERT INTO team_members(team_id,user_id,role) VALUES($1,'team-owner','owner'),($1,'operator','member'),($2,'outsider','owner')", team.ID, other.ID)
	exec("INSERT INTO project_members(project_id,user_id,role) VALUES($1,'operator','operator')", project.ID)
	exec("INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2),($1,$3),($4,$2)", host.ID, team.ID, other.ID, shared.ID)

	provider := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/version":
			_, _ = io.WriteString(w, `{"version":"1.23.0"}`)
		case "/login/oauth/access_token":
			_, _ = io.WriteString(w, `{"access_token":"mock-oauth-secret","refresh_token":"mock-refresh-secret","expires_in":3600}`)
		case "/api/v1/user":
			_, _ = io.WriteString(w, `{"login":"gitea-owner"}`)
		case "/api/v1/user/repos":
			_, _ = io.WriteString(w, `[{"full_name":"org/repo","name":"repo","default_branch":"main"}]`)
		default:
			t.Error("unexpected provider path", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer provider.Close()
	a.GitAuth = gitauth.New(a.Store, a.Origin)
	a.GitAuth.HTTP = provider.Client()
	instance, err := a.GitAuth.SaveInstance(ctx, gitauth.Instance{Name: "Approved Gitea", URL: provider.URL, ClientID: "client"}, "mock-client-secret")
	if err != nil {
		t.Fatal(err)
	}
	client := server.Client()
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	request := func(method, path, body, token string, want int) (string, string) {
		t.Helper()
		req, err := http.NewRequest(method, server.URL+"/api/v1"+path, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", "csrf")
		res, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		if res.StatusCode != want {
			t.Fatalf("%s %s = %d, want %d: %s", method, path, res.StatusCode, want, raw)
		}
		return string(raw), res.Header.Get("Location")
	}
	setupBody, _ := json.Marshal(map[string]string{"name": "Team code", "provider": "gitea", "teamId": team.ID, "instanceId": instance.ID})
	request("POST", "/git/setup/start", string(setupBody), operator, 403)
	request("POST", "/git/setup/start", string(setupBody), outsider, 403)
	request("POST", "/git/setup/start", `{"name":"Shared","provider":"github"}`, owner, 403)
	request("PUT", "/git/gitea/instances", `{}`, owner, 403)
	request("GET", "/git/gitea/instances?teamId="+team.ID, "", outsider, 403)
	if body, _ := request("GET", "/git/gitea/instances?teamId="+team.ID, "", owner, 200); !strings.Contains(body, instance.ID) || strings.Contains(body, "mock-client-secret") {
		t.Fatal(body)
	}
	request("POST", "/resources", `{"kind":"git","name":"Manual","data":{"provider":"github"}}`, owner, 403)

	decodeStart := func(body string) gitauth.Start {
		t.Helper()
		var start gitauth.Start
		if err := json.Unmarshal([]byte(body), &start); err != nil || start.ConnectionID == "" {
			t.Fatalf("invalid start: %s (%v)", body, err)
		}
		return start
	}
	callback := func(start gitauth.Start, code, token string) string {
		t.Helper()
		u, err := url.Parse(start.URL)
		if err != nil {
			t.Fatal(err)
		}
		q := url.Values{"state": {u.Query().Get("state")}, "code": {code}}
		_, location := request("GET", "/git/setup/gitea/callback?"+q.Encode(), "", token, 303)
		return location
	}
	initial, _ := request("POST", "/git/setup/start", string(setupBody), owner, 200)
	start := decodeStart(initial)
	id := start.ConnectionID
	authPath := "/git/" + id
	resourcePath := "/resources/" + id
	appInput := model.ResourceInput{Kind: "application", Name: "app", ParentID: env.ID}
	appData := model.App{ServerID: host.ID, GitID: id, Repository: "org/repo", Branch: "main", Engine: "dockerfile", Context: ".", File: "Dockerfile"}
	applicationBody := func() string {
		appInput.Data, _ = json.Marshal(appData)
		encoded, _ := json.Marshal(appInput)
		return string(encoded)
	}
	request("POST", "/resources", applicationBody(), operator, 409)
	if location := callback(start, "", owner); !strings.Contains(location, "cancelled") {
		t.Fatal(location)
	}
	if location := callback(start, "code", owner); !strings.Contains(location, "already+used") {
		t.Fatal(location)
	}
	reconnect, _ := request("POST", authPath+"/reconnect", `{}`, owner, 200)
	exec("UPDATE team_members SET role='member' WHERE team_id=$1 AND user_id='team-owner'", team.ID)
	if location := callback(decodeStart(reconnect), "code", owner); !strings.Contains(location, "no+longer+have+access") {
		t.Fatal(location)
	}
	exec("UPDATE team_members SET role='owner' WHERE team_id=$1 AND user_id='team-owner'", team.ID)
	reconnect, _ = request("POST", authPath+"/reconnect", `{}`, owner, 200)
	if location := callback(decodeStart(reconnect), "code", owner); !strings.Contains(location, "gitConnected=1") {
		t.Fatal(location)
	}
	if body, _ := request("GET", resourcePath, "", owner, 200); !strings.Contains(body, team.ID) || strings.Contains(body, "mock-oauth-secret") {
		t.Fatal(body)
	}
	request("GET", authPath+"/setup", "", owner, 200)
	request("GET", authPath+"/setup", "", operator, 403)
	request("POST", authPath+"/reconnect", `{}`, operator, 403)
	request("POST", authPath+"/webhook-secret", `{}`, operator, 403)
	request("POST", authPath+"/webhook-secret", `{}`, owner, 200)
	request("PUT", resourcePath, `{"data":{"provider":"gitea","url":"https://unapproved.test"}}`, owner, 403)
	request("DELETE", resourcePath, "", operator, 403)
	if body, _ := request("GET", authPath+"/repositories", "", operator, 200); !strings.Contains(body, "org/repo") {
		t.Fatal(body)
	}
	request("GET", authPath+"/repositories", "", outsider, 403)
	request("DELETE", resourcePath, "", outsider, 403)
	request("POST", resourcePath+"/grants", `{}`, admin, 409)
	if body, _ := request("GET", "/resources?kind=git", "", outsider, 200); body != "[]\n" {
		t.Fatal(body)
	}
	appInput.ParentID = otherEnv.ID
	request("POST", "/resources", applicationBody(), outsider, 400)
	appInput.ParentID = env.ID
	appRaw, _ := request("POST", "/resources", applicationBody(), operator, 200)
	var app model.Resource
	if err := json.Unmarshal([]byte(appRaw), &app); err != nil || app.ID == "" {
		t.Fatal(appRaw, err)
	}
	request("POST", "/applications/"+app.ID+"/deploy", `{}`, operator, 202)
	exec("INSERT INTO webhook_deliveries(provider_id,delivery_id) VALUES($1,'delivery')", id)
	request("DELETE", resourcePath, "", owner, 409)
	appInput.Version = app.Version
	appData.GitID = shared.ID
	request("PUT", "/resources/"+app.ID, applicationBody(), operator, 200)
	request("POST", "/applications/"+app.ID+"/deploy", `{}`, operator, 202)
	request("DELETE", resourcePath, "", owner, 200)
	request("GET", resourcePath, "", owner, 404)
	var deliveries int
	if err := a.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM webhook_deliveries WHERE provider_id=$1", id).Scan(&deliveries); err != nil || deliveries != 0 {
		t.Fatal(deliveries, err)
	}
}
