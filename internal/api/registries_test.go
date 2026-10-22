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

func TestRegistryAPIAdministrationGrantsAndSecrets(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	session := func(admin bool) (string, string) {
		t.Helper()
		id, token := uuid.NewString(), secure.Token()
		if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'Test','disabled',$3)", id, id+"@test.invalid", admin); err != nil {
			t.Fatal(err)
		}
		if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id); err != nil {
			t.Fatal(err)
		}
		return id, token
	}
	_, admin := session(true)
	user, member := session(false)
	request := func(method, path, body, token string) (int, []byte) {
		t.Helper()
		req, _ := http.NewRequest(method, server.URL+"/api/v1"+path, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", "csrf")
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		data, _ := io.ReadAll(res.Body)
		return res.StatusCode, data
	}
	team, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: "team", Name: "Team", Data: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = a.Store.Pool.Exec(ctx, "INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,'owner')", team.ID, user); err != nil {
		t.Fatal(err)
	}
	body := `{"kind":"registry","name":"Images","data":{"hostname":"GHCR.IO","username":"alice"},"secrets":{"password":"never-public-token"}}`
	if code, _ := request("POST", "/resources", body, member); code != 403 {
		t.Fatal("member created registry", code)
	}
	code, raw := request("POST", "/resources", body, admin)
	if code != 200 || strings.Contains(string(raw), "never-public-token") {
		t.Fatal(code, string(raw))
	}
	var registry model.Resource
	if err = json.Unmarshal(raw, &registry); err != nil {
		t.Fatal(err)
	}
	if code, raw = request("POST", "/resources/"+registry.ID+"/grants", `{"teamId":"`+team.ID+`","granted":true}`, admin); code != 200 {
		t.Fatal(code, string(raw))
	}
	if code, raw = request("GET", "/resources", "", member); code != 200 || !strings.Contains(string(raw), registry.ID) || strings.Contains(string(raw), "never-public-token") {
		t.Fatal("granted read failed", code, string(raw))
	}
	if code, _ = request("DELETE", "/resources/"+registry.ID, `{}`, member); code != 403 {
		t.Fatal("member deleted registry", code)
	}
	if code, raw = request("DELETE", "/resources/"+registry.ID, `{}`, admin); code != 200 {
		t.Fatal(code, string(raw))
	}
}

func TestStopAPIAcceptsWithoutActiveReleaseAndPublishesRuntime(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	user, token := uuid.NewString(), secure.Token()
	if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'Admin','disabled',true)", user, user+"@test.invalid"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), user); err != nil {
		t.Fatal(err)
	}
	app, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: "application", Name: "Failed app", Data: json.RawMessage(`{"source":"compose","engine":"compose"}`)})
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path, body string) (int, []byte) {
		t.Helper()
		req, _ := http.NewRequest(method, server.URL+"/api/v1/applications/"+app.ID+path, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", "csrf")
		res, e := server.Client().Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		return res.StatusCode, raw
	}
	if code, raw := request("POST", "/action", `{"action":"stop"}`); code != 202 {
		t.Fatal(code, string(raw))
	}
	if code, raw := request("GET", "/runtime", ""); code != 200 || !strings.Contains(string(raw), `"status":"stopping"`) {
		t.Fatal(code, string(raw))
	}
}
