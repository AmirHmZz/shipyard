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

func TestDeploymentActionsPermissionsConfirmationAndStatus(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	save := func(kind, parent, team string, data any, secrets map[string]string) model.Resource {
		t.Helper()
		raw, _ := json.Marshal(data)
		r, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: kind, Name: kind, ParentID: parent, TeamID: team, Data: raw, Secrets: secrets})
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	team := save("team", "", "", map[string]any{}, nil)
	project := save("project", team.ID, team.ID, map[string]any{}, nil)
	env := save("environment", project.ID, team.ID, map[string]any{}, nil)
	host := save("server", "", "", model.Server{}, nil)
	_, err := a.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", host.ID, team.ID)
	if err != nil {
		t.Fatal(err)
	}
	app := save("application", env.ID, team.ID, model.App{ServerID: host.ID, Source: "compose", Engine: "compose"}, map[string]string{"compose": "services:\n  web:\n    image: busybox:1.37.0\n"})
	session := func(role string) string {
		t.Helper()
		id, token := uuid.NewString(), secure.Token()
		if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password) VALUES($1,$2,'test','disabled')", id, id+"@test.invalid"); err != nil {
			t.Fatal(err)
		}
		if role != "" {
			if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3)", project.ID, id, role); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id); err != nil {
			t.Fatal(err)
		}
		return token
	}
	operator, viewer, outsider := session("operator"), session("viewer"), session("")
	request := func(method, path string, body any, token, csrf string) (int, []byte) {
		t.Helper()
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
		out, _ := io.ReadAll(res.Body)
		return res.StatusCode, out
	}
	deployPath := "/applications/" + app.ID + "/deploy"
	for _, role := range []struct {
		token    string
		expected int
	}{{operator, 200}, {viewer, 200}, {outsider, 403}} {
		if code, raw := request("GET", "/applications/"+app.ID+"/volumes", nil, role.token, ""); code != role.expected {
			t.Fatal("volume read permissions", code, string(raw))
		}
	}
	valid := map[string]any{"fresh": true, "confirmName": app.Name, "version": app.Version}
	for _, body := range []map[string]any{{"fresh": true}, {"fresh": true, "confirmName": "wrong", "version": app.Version}, {"fresh": true, "confirmName": app.Name}} {
		if code, raw := request("POST", deployPath, body, operator, "csrf"); code != 400 {
			t.Fatal("unconfirmed fresh deploy accepted", code, string(raw))
		}
	}
	stale := map[string]any{"fresh": true, "confirmName": app.Name, "version": app.Version + 1}
	if code, raw := request("POST", deployPath, stale, operator, "csrf"); code != 409 {
		t.Fatal("stale version accepted", code, string(raw))
	}
	for _, attempt := range []struct{ token, csrf string }{{viewer, "csrf"}, {outsider, "csrf"}, {operator, ""}} {
		if code, raw := request("POST", deployPath, valid, attempt.token, attempt.csrf); code != 403 {
			t.Fatal("unauthorized fresh deploy", code, string(raw))
		}
	}
	code, raw := request("POST", deployPath, valid, operator, "csrf")
	if code != 202 {
		t.Fatal(code, string(raw))
	}
	var fresh model.Deployment
	if err = json.Unmarshal(raw, &fresh); err != nil {
		t.Fatal(err)
	}
	if code, raw = request("DELETE", "/deployments/"+fresh.ID, nil, operator, "csrf"); code != 409 {
		t.Fatal("queued deployment deleted", code, string(raw))
	}
	if err = a.Store.Stage(ctx, fresh.ID, "failed", "failed", ""); err != nil {
		t.Fatal(err)
	}
	path := "/deployments/" + fresh.ID
	for _, attempt := range []struct{ token, csrf string }{{viewer, "csrf"}, {outsider, "csrf"}, {operator, ""}} {
		if code, raw = request("DELETE", path, nil, attempt.token, attempt.csrf); code != 403 {
			t.Fatal("unauthorized deployment deletion", code, string(raw))
		}
	}
	if code, raw = request("DELETE", path, nil, operator, "csrf"); code != 202 {
		t.Fatal(code, string(raw))
	}
	if code, raw = request("GET", path, nil, operator, "csrf"); code != 200 || !strings.Contains(string(raw), `"deleting":true`) {
		t.Fatal("missing cleanup status", code, string(raw))
	}
	if code, raw = request("DELETE", "/deployments/"+uuid.NewString(), nil, operator, "csrf"); code != 404 {
		t.Fatal("unknown deployment", code, string(raw))
	}
	if code, raw = request("POST", deployPath, map[string]any{}, operator, "csrf"); code != 202 {
		t.Fatal("ordinary deployment changed", code, string(raw))
	}
}
