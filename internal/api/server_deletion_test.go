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

func TestServerDeletionAuthorizationAndGenericBypass(t *testing.T) {
	a, s := testAPI(t)
	ctx := context.Background()
	raw, _ := json.Marshal(model.Server{Host: "192.0.2.1", Port: 22, User: "root"})
	host, e := a.Store.Save(ctx, "", model.ResourceInput{Kind: "server", Name: "remote", Data: raw})
	if e != nil {
		t.Fatal(e)
	}
	tokens := map[string]string{}
	for _, role := range []string{"admin", "viewer"} {
		id, token := uuid.NewString(), secure.Token()
		tokens[role] = token
		if _, e = a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'test','disabled',$3)", id, id+"@test.invalid", role == "admin"); e != nil {
			t.Fatal(e)
		}
		if _, e = a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id); e != nil {
			t.Fatal(e)
		}
	}
	endpoints := []struct{ method, path string }{{"POST", "/servers/" + host.ID + "/deletion-plan"}, {"DELETE", "/servers/" + host.ID}, {"DELETE", "/resources/" + host.ID}, {"GET", "/servers/" + host.ID + "/deletion"}, {"POST", "/servers/" + host.ID + "/deletion/retry"}, {"PUT", "/servers/" + host.ID + "/deletion/connection"}}
	request := func(method, path, token, csrf string) int {
		t.Helper()
		req, _ := http.NewRequest(method, s.URL+"/api/v1"+path, strings.NewReader(`{}`))
		if token != "" {
			req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		}
		req.Header.Set("X-CSRF-Token", csrf)
		req.Header.Set("Content-Type", "application/json")
		res, err := s.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		_, _ = io.Copy(io.Discard, res.Body)
		return res.StatusCode
	}
	for _, endpoint := range endpoints {
		for _, token := range []string{"", tokens["viewer"]} {
			code := request(endpoint.method, endpoint.path, token, "csrf")
			if code != 401 && code != 403 {
				t.Fatalf("unauthorized %s %s: %d", endpoint.method, endpoint.path, code)
			}
		}
	}
	for _, path := range []string{"/servers/" + host.ID, "/resources/" + host.ID} {
		if code := request("DELETE", path, tokens["admin"], "csrf"); code != 409 {
			t.Fatal("missing approval bypassed cleanup", code)
		}
		if code := request("DELETE", path, tokens["admin"], ""); code != 403 {
			t.Fatal("missing CSRF accepted", code)
		}
	}
	if _, e = a.Store.Resource(ctx, host.ID); e != nil {
		t.Fatal("unapproved server removed")
	}
	raw, _ = json.Marshal(model.Server{Connection: "local"})
	local, e := a.Store.Save(ctx, "shipyard-local", model.ResourceInput{Kind: "server", Name: "Local host", Data: raw})
	if e != nil {
		t.Fatal(e)
	}
	for _, path := range []string{"/servers/" + local.ID, "/resources/" + local.ID} {
		if code := request("DELETE", path, tokens["admin"], "csrf"); code != 403 {
			t.Fatal("local deletion allowed", code)
		}
	}
}
