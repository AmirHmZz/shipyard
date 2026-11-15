package api

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"io"
	"net/http"
	"shipyard/internal/model"
	"shipyard/internal/secure"
	"shipyard/internal/testcontract"
	"strings"
	"testing"
)

func TestAutomationAndResourceLimitAPIContracts(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	save := func(kind, parent, team string, data any) model.Resource {
		t.Helper()
		raw, _ := json.Marshal(data)
		r, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: kind, Name: kind, ParentID: parent, TeamID: team, Data: raw})
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	team := save("team", "", "", map[string]any{})
	project := save("project", team.ID, team.ID, map[string]any{})
	env := save("environment", project.ID, team.ID, map[string]any{})
	host := save("server", "", "", model.Server{})
	app := save("application", env.ID, team.ID, model.App{Engine: "dockerfile", ServerID: host.ID})
	session := func(role string) string {
		t.Helper()
		id, token := uuid.NewString(), secure.Token()
		_, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password) VALUES($1,$2,'test','disabled')", id, id+"@test.invalid")
		if err != nil {
			t.Fatal(err)
		}
		_, err = a.Store.Pool.Exec(ctx, "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3)", project.ID, id, role)
		if err != nil {
			t.Fatal(err)
		}
		_, err = a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id)
		if err != nil {
			t.Fatal(err)
		}
		return token
	}
	operator, viewer := session("operator"), session("viewer")
	request := func(method, path, body, token string) (int, string) {
		t.Helper()
		req, _ := http.NewRequest(method, server.URL+"/api/v1/applications/"+app.ID+path, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", "csrf")
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		if res.StatusCode == 200 {
			testcontract.Response(t, req, res, raw)
		}
		return res.StatusCode, string(raw)
	}
	for _, path := range []string{"/automation", "/resource-limits"} {
		if code, body := request("GET", path, "", viewer); code != 200 {
			t.Fatal(code, body)
		}
		if code, _ := request("PUT", path, "{}", viewer); code != 403 {
			t.Fatal("viewer mutation", path, code)
		}
	}
	policy := `{"version":0,"restarts":[{"service":"app","enabled":true,"intervalSeconds":3600}],"rules":[{"id":"weekday","enabled":true,"action":"start","cron":"0 8 * * 1-5","timezone":"Asia/Tehran"}]}`
	if code, body := request("PUT", "/automation", policy, operator); code != 200 || !strings.Contains(body, `"version":1`) {
		t.Fatal(code, body)
	}
	if code, _ := request("PUT", "/automation", policy, operator); code != 409 {
		t.Fatal("stale automation save", code)
	}
	if code, body := request("GET", "/automation/preview?cron=0+8+*+*+1-5&timezone=Asia%2FTehran", "", viewer); code != 200 {
		t.Fatal(code, body)
	}
	if code, _ := request("GET", "/automation/preview?cron=bad&timezone=UTC", "", viewer); code != 422 {
		t.Fatal("invalid cron accepted", code)
	}
	limits := `{"version":1,"services":{"app":{"cpus":0.5,"memoryBytes":268435456}}}`
	if code, body := request("PUT", "/resource-limits", limits, operator); code != 200 || !strings.Contains(body, `"pending":true`) {
		t.Fatal(code, body)
	}
	if code, _ := request("PUT", "/resource-limits", limits, operator); code != 409 {
		t.Fatal("stale limits save", code)
	}
	if code, _ := request("PUT", "/resource-limits", `{"version":2,"services":{"app":{"memoryBytes":1}}}`, operator); code != 422 {
		t.Fatal("invalid RAM limit accepted", code)
	}
}
