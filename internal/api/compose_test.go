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

func TestDirectComposePermissionsEncryptionAndRevisions(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	save := func(kind, parent, team string, data any) model.Resource {
		raw, _ := json.Marshal(data)
		r, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: kind, Name: kind, ParentID: parent, TeamID: team, Data: raw})
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	team := save("team", "", "", map[string]any{})
	project := save("project", team.ID, team.ID, map[string]any{})
	environment := save("environment", project.ID, team.ID, map[string]any{})
	host := save("server", "", "", model.Server{})
	_, _ = a.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", host.ID, team.ID)
	session := func(role string) string {
		id, token := uuid.NewString(), secure.Token()
		_, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password) VALUES($1,$2,'test','disabled')", id, id+"@test.invalid")
		if err != nil {
			t.Fatal(err)
		}
		_, _ = a.Store.Pool.Exec(ctx, "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3)", project.ID, id, role)
		_, _ = a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id)
		return token
	}
	operator, viewer := session("operator"), session("viewer")
	request := func(method, path string, body any, token, csrf string) (int, []byte) {
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, server.URL+"/api/v1"+path, strings.NewReader(string(raw)))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		raw, _ = io.ReadAll(res.Body)
		return res.StatusCode, raw
	}
	source := "services:\n  web:\n    image: nginx:alpine\n    environment:\n      PASSWORD: private-compose-value\n"
	input := map[string]any{"kind": "application", "name": "Raw Compose", "parentId": environment.ID, "data": map[string]any{"source": "compose", "engine": "compose", "serverId": host.ID}, "secrets": map[string]string{"compose": source}}
	code, body := request("POST", "/resources", input, operator, "csrf")
	if code != 200 {
		t.Fatal(code, string(body))
	}
	if strings.Contains(string(body), "private-compose-value") {
		t.Fatal("public create response exposed source")
	}
	var app model.Resource
	if err := json.Unmarshal(body, &app); err != nil {
		t.Fatal(err)
	}
	for _, method := range []string{"GET", "PUT"} {
		code, body = request(method, "/applications/"+app.ID+"/compose", map[string]any{"yaml": source, "version": 1}, viewer, "csrf")
		if code != 403 || strings.Contains(string(body), "private-compose-value") {
			t.Fatal("viewer access", code, string(body))
		}
	}
	code, body = request("GET", "/applications/"+app.ID+"/compose", nil, operator, "")
	if code != 200 || !strings.Contains(string(body), "private-compose-value") {
		t.Fatal(code, string(body))
	}
	stored, _ := a.Store.Resource(ctx, app.ID)
	if strings.Contains(string(stored.Secret), "private-compose-value") {
		t.Fatal("source not encrypted")
	}
	code, _ = request("PUT", "/applications/"+app.ID+"/compose", map[string]any{"yaml": source, "version": 1}, operator, "")
	if code != 403 {
		t.Fatal("CSRF bypass", code)
	}
	code, _ = request("PUT", "/applications/"+app.ID+"/compose", map[string]any{"yaml": "services: [", "version": 1}, operator, "csrf")
	if code != 400 {
		t.Fatal("invalid YAML accepted", code)
	}
	updated := "services:\n  web:\n    image: busybox\n"
	code, body = request("PUT", "/applications/"+app.ID+"/compose", map[string]any{"yaml": updated, "version": 1}, operator, "csrf")
	if code != 200 || !strings.Contains(string(body), `"version":2`) {
		t.Fatal(code, string(body))
	}
	code, _ = request("PUT", "/applications/"+app.ID+"/compose", map[string]any{"yaml": source, "version": 1}, operator, "csrf")
	if code != 409 {
		t.Fatal("stale YAML write", code)
	}
	code, _ = request("POST", "/applications/"+app.ID+"/deploy", map[string]any{"version": 1}, operator, "csrf")
	if code != 409 {
		t.Fatal("stale deploy accepted", code)
	}
	code, body = request("POST", "/applications/"+app.ID+"/deploy", map[string]any{"version": 2}, operator, "csrf")
	if code != 202 {
		t.Fatal("Git-less deploy failed", code, string(body))
	}
	code, body = request("GET", "/resources/"+app.ID, nil, viewer, "")
	if code != 200 || strings.Contains(string(body), updated) || strings.Contains(string(body), "private-compose-value") {
		t.Fatal("viewer resource leakage", code, string(body))
	}
}
