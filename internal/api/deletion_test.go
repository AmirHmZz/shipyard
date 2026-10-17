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

func TestDeletionPermissionsCSRFAndFrozenWrites(t *testing.T) {
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
	env := save("environment", project.ID, team.ID, map[string]any{})
	app := save("application", env.ID, team.ID, model.App{})
	session := func(role string) string {
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
	request := func(method, path, body, token, csrf string) (int, []byte) {
		req, _ := http.NewRequest(method, server.URL+"/api/v1"+path, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		return res.StatusCode, raw
	}
	for _, r := range []model.Resource{project, app} {
		for _, attempt := range []struct{ token, csrf string }{{viewer, "csrf"}, {outsider, "csrf"}, {operator, ""}} {
			if code, body := request("DELETE", "/resources/"+r.ID, "{}", attempt.token, attempt.csrf); code != 403 {
				t.Fatal("unauthorized deletion", code, string(body))
			}
		}
	}
	code, body := request("DELETE", "/resources/"+project.ID, "{}", operator, "csrf")
	if code != 202 {
		t.Fatal(code, string(body))
	}
	var queued struct {
		JobID string `json:"jobId"`
	}
	_ = json.Unmarshal(body, &queued)
	if queued.JobID == "" {
		t.Fatal("missing durable job", string(body))
	}
	code, again := request("DELETE", "/resources/"+project.ID, "{}", operator, "csrf")
	if code != 202 || string(again) != string(body) {
		t.Fatal("duplicate deletion not idempotent", code, string(again))
	}
	if code, body = request("DELETE", "/resources/"+app.ID, "{}", operator, "csrf"); code != 409 {
		t.Fatal("overlapping cleanup allowed", code, string(body))
	}
	if code, body = request("POST", "/applications/"+app.ID+"/deploy", "{}", operator, "csrf"); code != 409 {
		t.Fatal("deploy during deletion", code, string(body))
	}
	raw, _ := json.Marshal(model.ResourceInput{Kind: "environment", Name: "late", ParentID: project.ID, Data: json.RawMessage(`{}`)})
	if code, body = request("POST", "/resources", string(raw), operator, "csrf"); code != 409 {
		t.Fatal("new child during deletion", code, string(body))
	}
	current, err := a.Store.Resource(ctx, app.ID)
	if err != nil || !model.IsDeleting(current) {
		t.Fatal("descendant not frozen", err)
	}
}
