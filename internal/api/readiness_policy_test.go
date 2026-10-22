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

func TestApplicationReadinessPolicyDefaultsAndCompatibility(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	save := func(kind, parent, team string, data any) model.Resource {
		raw, _ := json.Marshal(data)
		secrets := map[string]string{}
		if kind == "application" {
			secrets["compose"] = "services:\n  app:\n    image: busybox:1.37.0\n    command: sleep 600\n"
		}
		value, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: kind, Name: kind, ParentID: parent, TeamID: team, Data: raw, Secrets: secrets})
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	team := save("team", "", "", map[string]any{})
	project := save("project", team.ID, team.ID, map[string]any{})
	environment := save("environment", project.ID, team.ID, map[string]any{})
	host := save("server", "", "", model.Server{})
	if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", host.ID, team.ID); err != nil {
		t.Fatal(err)
	}
	uid, token := uuid.NewString(), secure.Token()
	if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'Admin','disabled',true)", uid, uid+"@example.com"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), uid); err != nil {
		t.Fatal(err)
	}
	request := func(method, path string, payload any) model.Resource {
		raw, _ := json.Marshal(payload)
		req, _ := http.NewRequest(method, server.URL+"/api/v1"+path, strings.NewReader(string(raw)))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", "csrf")
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(res.Body)
		if res.StatusCode != 200 {
			t.Fatalf("%d %s", res.StatusCode, body)
		}
		var result model.Resource
		if err = json.Unmarshal(body, &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	spec := model.App{Source: "compose", Engine: "compose", ServerID: host.ID, ReadinessChecks: []model.HTTPReadinessCheck{{Service: "app", Port: 8080, Path: "/ready"}}, HealthTimeout: 300}
	app := request("POST", "/resources", map[string]any{"kind": "application", "name": "New", "parentId": environment.ID, "data": spec, "secrets": map[string]string{"compose": "services:\n  app:\n    image: busybox:1.37.0\n    command: sleep 600\n"}})
	created, _ := model.Decode[model.App](app)
	if created.ReadinessMode != "container" {
		t.Fatal("API creation did not default to container", created.ReadinessMode)
	}
	// An older client omitting the policy must not switch a newer application's policy.
	updated := request("PUT", "/resources/"+app.ID, map[string]any{"kind": "application", "name": app.Name, "version": app.Version, "data": spec})
	current, _ := model.Decode[model.App](updated)
	if current.ReadinessMode != "container" || current.HealthTimeout != 300 || len(current.ReadinessChecks) != 1 {
		t.Fatal("omitted policy reset configuration", current)
	}
	// Older persisted applications still use checks on unrelated edits.
	legacy := save("application", environment.ID, team.ID, spec)
	updated = request("PUT", "/resources/"+legacy.ID, map[string]any{"kind": "application", "name": legacy.Name, "version": legacy.Version, "data": spec})
	current, _ = model.Decode[model.App](updated)
	if current.ReadinessMode != "" || !current.CheckedReadiness() {
		t.Fatal("legacy policy changed", current)
	}
	spec.ReadinessMode = "container"
	updated = request("PUT", "/resources/"+legacy.ID, map[string]any{"kind": "application", "name": legacy.Name, "version": updated.Version, "data": spec})
	current, _ = model.Decode[model.App](updated)
	if current.CheckedReadiness() {
		t.Fatal("explicit policy was ignored")
	}
}
