package api

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"io"
	"net/http"
	"shipyard/internal/model"
	"shipyard/internal/secure"
	"strings"
	"testing"
)

func TestJobAPIPermissionsVersionsIdempotencyAndReplay(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	save := func(kind, parent, team string, data any) model.Resource {
		t.Helper()
		b, _ := json.Marshal(data)
		r, e := a.Store.Save(ctx, "", model.ResourceInput{Kind: kind, Name: kind, ParentID: parent, TeamID: team, Data: b})
		if e != nil {
			t.Fatal(e)
		}
		return r
	}
	team := save("team", "", "", map[string]any{})
	project := save("project", team.ID, team.ID, map[string]any{})
	env := save("environment", project.ID, team.ID, map[string]any{})
	app := save("application", env.ID, team.ID, model.App{Workload: "job", Engine: "dockerfile"})
	d := uuid.NewString()
	_, err := a.Store.Pool.Exec(ctx, "INSERT INTO deployments(id,app_id,snapshot) VALUES($1,$2,$3)", d, app.ID, []byte{})
	if err != nil {
		t.Fatal(err)
	}
	release := model.Release{ID: uuid.NewString(), AppID: app.ID, DeploymentID: d, App: model.App{Workload: "job"}}
	if err = a.Store.SaveRelease(ctx, release); err != nil {
		t.Fatal(err)
	}
	if err = a.Store.Activate(ctx, release); err != nil {
		t.Fatal(err)
	}
	session := func(role string) string {
		t.Helper()
		id, token := uuid.NewString(), secure.Token()
		_, e := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password) VALUES($1,$2,'test','disabled')", id, id+"@test.invalid")
		if e != nil {
			t.Fatal(e)
		}
		_, _ = a.Store.Pool.Exec(ctx, "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3)", project.ID, id, role)
		_, _ = a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id)
		return token
	}
	operator, viewer := session("operator"), session("viewer")
	request := func(method, path, body, token, csrf string, after string) (int, string) {
		t.Helper()
		req, _ := http.NewRequest(method, server.URL+"/api/v1/applications/"+app.ID+path, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		if after != "" {
			req.Header.Set("Last-Event-ID", after)
		}
		res, e := server.Client().Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return res.StatusCode, string(b)
	}
	if code, body := request("GET", "/job-settings", "", viewer, "", ""); code != 200 {
		t.Fatal(code, body)
	}
	for _, args := range []struct{ token, csrf string }{{viewer, "csrf"}, {operator, ""}} {
		if code, _ := request("POST", "/runs", "{}", args.token, args.csrf, ""); code != 403 {
			t.Fatal("unauthorized mutation", code)
		}
	}
	p := model.DefaultJobSettings()
	b, _ := json.Marshal(p)
	if code, body := request("PUT", "/job-settings", string(b), operator, "csrf", ""); code != 200 {
		t.Fatal(code, body)
	}
	if code, _ := request("PUT", "/job-settings", string(b), operator, "csrf", ""); code != 409 {
		t.Fatal("stale settings accepted", code)
	}
	code, body := request("POST", "/runs", `{"idempotencyKey":"same"}`, operator, "csrf", "")
	if code != 202 {
		t.Fatal(code, body)
	}
	var run model.JobRun
	_ = json.Unmarshal([]byte(body), &run)
	code, body = request("POST", "/runs", `{"idempotencyKey":"same"}`, operator, "csrf", "")
	if code != 202 || !strings.Contains(body, run.ID) {
		t.Fatal("duplicate run", code, body)
	}
	if code, body = request("POST", "/runs", `{"idempotencyKey":"other"}`, operator, "csrf", ""); code != 409 || !strings.Contains(body, `"activeRunId":"`+run.ID+`"`) {
		t.Fatal(code, body)
	}
	if code, body = request("GET", "/runs/"+run.ID, "", viewer, "", ""); code != 200 {
		t.Fatal(code, body)
	}
	if code, body = request("POST", "/runs/"+run.ID+"/cancel", "{}", operator, "csrf", ""); code != 200 || !strings.Contains(body, `"state":"cancelled"`) {
		t.Fatal(code, body)
	}
	if _, err = a.Store.Pool.Exec(ctx, "UPDATE job_runs SET cleanup_pending=false WHERE id=$1", run.ID); err != nil {
		t.Fatal(err)
	}
	var cursor string
	if err = a.Store.Pool.QueryRow(ctx, "INSERT INTO job_run_events(run_id,message) VALUES($1,'first') RETURNING id::text", run.ID).Scan(&cursor); err != nil {
		t.Fatal(err)
	}
	_, _ = a.Store.Pool.Exec(ctx, "INSERT INTO job_run_events(run_id,message) VALUES($1,'second')", run.ID)
	if code, body = request("GET", "/runs/"+run.ID+"/events", "", viewer, "", cursor); code != 200 || strings.Contains(body, `"message":"first"`) || !strings.Contains(body, `"message":"second"`) {
		t.Fatal(code, body)
	}
	// Cancellation remains usable while maintenance prevents new work.
	next, err := a.Store.QueueJobRun(ctx, app.ID, "operator", "next")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = a.Store.Pool.Exec(ctx, "UPDATE settings SET value='true' WHERE key='maintenance'")
	if code, _ := request("POST", "/runs", "{}", operator, "csrf", ""); code != 503 {
		t.Fatal(code)
	}
	if code, body = request("POST", "/runs/"+next.ID+"/cancel", "{}", operator, "csrf", ""); code != 200 {
		t.Fatal(code, body)
	}
}
