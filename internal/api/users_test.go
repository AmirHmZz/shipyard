package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"shipyard/internal/model"
	"shipyard/internal/secure"
)

func TestDeleteUser(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := a.Store.Pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec("INSERT INTO users(id,email,name,password,admin) VALUES ('admin','admin@example.test','Admin','unused',true),('owner','owner@example.test','Owner','unused',false)")
	exec("INSERT INTO users(id,email,name,password,disabled) VALUES ('disabled','disabled@example.test','Disabled member','unused',true)")
	adminToken, ownerToken := secure.Token(), secure.Token()
	exec("INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,'admin','csrf',now()+interval '1 hour'),($2,'owner','csrf',now()+interval '1 hour')", secure.Hash(adminToken), secure.Hash(ownerToken))
	exec("INSERT INTO resources(id,kind,name,team_id,parent_id) VALUES ('team','team','Team','team',''),('project','project','Project','team','team')")
	exec("INSERT INTO team_members(team_id,user_id,role) VALUES ('team','owner','owner')")
	exec("INSERT INTO project_members(project_id,user_id,role) VALUES ('project','owner','owner')")
	exec("INSERT INTO audit(user_id,action) VALUES ('owner','test.previous_action')")

	request := func(method, path, body, token, csrf, origin string, want int) *http.Response {
		t.Helper()
		req, err := http.NewRequest(method, server.URL+"/api/v1"+path, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		if token != "" {
			req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		req.Header.Set("Origin", origin)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { res.Body.Close() })
		if res.StatusCode != want {
			t.Fatalf("%s %s returned %d, want %d", method, path, res.StatusCode, want)
		}
		return res
	}
	invite := func() string {
		t.Helper()
		res := request("POST", "/teams/team/invitations", `{"email":"owner@example.test","role":"member"}`, adminToken, "csrf", a.Origin, 201)
		var result struct{ URL string }
		if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
			t.Fatal(err)
		}
		link, err := url.Parse(result.URL)
		if err != nil {
			t.Fatal(err)
		}
		return link.Query().Get("token")
	}
	oldInvite := invite()
	request("DELETE", "/users/owner", "", "", "", a.Origin, 401)
	request("DELETE", "/users/owner", "", ownerToken, "csrf", a.Origin, 403)
	request("DELETE", "/users/owner", "", adminToken, "", a.Origin, 403)
	request("DELETE", "/users/owner", "", adminToken, "csrf", "https://other.test", 403)
	request("DELETE", "/users/admin", "", adminToken, "csrf", a.Origin, 409)
	request("DELETE", "/users/disabled", "", adminToken, "csrf", a.Origin, 200)

	// Simulate an administrator who lost access after passing request middleware.
	staleContext := context.WithValue(ctx, userKey, model.User{ID: "owner", Admin: true})
	route := chi.NewRouter()
	route.Delete("/users/{id}", a.deleteUser)
	staleResponse := httptest.NewRecorder()
	route.ServeHTTP(staleResponse, httptest.NewRequest("DELETE", "/users/admin", nil).WithContext(staleContext))
	if staleResponse.Code != 403 {
		t.Fatalf("stale administrator could delete a user: %d", staleResponse.Code)
	}

	res := request("DELETE", "/users/owner", "", adminToken, "csrf", a.Origin, 200)
	var result struct{ OK bool }
	if err := json.NewDecoder(res.Body).Decode(&result); err != nil || !result.OK {
		t.Fatalf("invalid deletion acknowledgement: %+v, %v", result, err)
	}
	request("DELETE", "/users/owner", "", adminToken, "csrf", a.Origin, 404)
	request("GET", "/auth/me", "", ownerToken, "", "", 401)

	for _, check := range []struct {
		query string
		want  int
	}{
		{"SELECT count(*) FROM users WHERE id='owner'", 0},
		{"SELECT count(*) FROM sessions WHERE user_id='owner'", 0},
		{"SELECT count(*) FROM team_members WHERE user_id='owner'", 0},
		{"SELECT count(*) FROM project_members WHERE user_id='owner'", 0},
		{"SELECT count(*) FROM resources WHERE id IN ('team','project')", 2},
		{"SELECT count(*) FROM audit WHERE user_id='owner' AND action='test.previous_action'", 1},
		{"SELECT count(*) FROM audit WHERE user_id='admin' AND action='user.deleted' AND resource_id='owner'", 1},
	} {
		var count int
		if err := a.Store.Pool.QueryRow(ctx, check.query).Scan(&count); err != nil || count != check.want {
			t.Errorf("%s returned %d, want %d: %v", check.query, count, check.want, err)
		}
	}
	accept := func(token string, want int) {
		t.Helper()
		body, err := json.Marshal(loginInput{Token: token, Name: "Reinvited owner", Password: "password for test"})
		if err != nil {
			t.Fatal(err)
		}
		request("POST", "/auth/accept", string(body), "", "", a.Origin, want)
	}
	accept(oldInvite, 400)
	accept(invite(), 200)
}
