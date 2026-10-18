package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"shipyard/internal/model"
	"shipyard/internal/secure"
)

func TestVariableAPIVisibilityPermissionsAndConflicts(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	uid, session, csrf := uuid.NewString(), secure.Token(), secure.Token()
	if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'operator','disabled',true)", uid, uid+"@test.invalid"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", secure.Hash(session), uid, csrf); err != nil {
		t.Fatal(err)
	}
	team, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: "team", Name: "test", Data: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	project, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: "project", Name: "test", TeamID: team.ID, ParentID: team.ID, Data: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	request := func(method string, body any) (int, []byte) {
		t.Helper()
		b, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, server.URL+"/api/v1/resources/"+project.ID, bytes.NewReader(b))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: session})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", a.Origin)
		req.Header.Set("X-CSRF-Token", csrf)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		return res.StatusCode, raw
	}
	input := map[string]any{"kind": "project", "name": "test", "data": map[string]any{}, "version": project.Version, "variables": map[string]any{"env:ORIGIN": "visible", "env:EMPTY": ""}, "secrets": map[string]string{"env:TOKEN": "hidden-value"}}
	status, raw := request("PUT", input)
	if status != 200 || !bytes.Contains(raw, []byte("visible")) || bytes.Contains(raw, []byte("hidden-value")) {
		t.Fatalf("save: %d %s", status, raw)
	}
	if status, _ := request("PUT", input); status != 409 {
		t.Fatal("stale update accepted", status)
	}
	var updated model.Resource
	if err := json.Unmarshal(raw, &updated); err != nil {
		t.Fatal(err)
	}
	input["version"] = updated.Version
	input["variables"] = map[string]any{"build:TOKEN": "plaintext"}
	delete(input, "secrets")
	if status, _ := request("PUT", input); status != 400 {
		t.Fatal("plaintext build secret accepted", status)
	}
	input["variables"] = map[string]any{"env:TOKEN": "replacement"}
	input["secrets"] = map[string]string{"env:TOKEN": "conflict"}
	if status, _ := request("PUT", input); status != 400 {
		t.Fatal("conflicting writes accepted", status)
	}
	delete(input, "secrets")
	status, raw = request("PUT", input)
	if status != 200 || !bytes.Contains(raw, []byte("replacement")) {
		t.Fatalf("replacement: %d %s", status, raw)
	}
	if _, err := a.Store.Pool.Exec(ctx, "UPDATE users SET admin=false WHERE id=$1", uid); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'viewer')", project.ID, uid); err != nil {
		t.Fatal(err)
	}
	status, raw = request("GET", nil)
	if status != 200 || !bytes.Contains(raw, []byte("visible")) || bytes.Contains(raw, []byte("hidden-value")) {
		t.Fatalf("viewer read: %d %s", status, raw)
	}
	if status, _ := request("PUT", input); status != 403 {
		t.Fatal("viewer modified variables", status)
	}
}
