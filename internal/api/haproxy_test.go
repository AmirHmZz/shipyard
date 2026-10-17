package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"shipyard/internal/control"
	"shipyard/internal/model"
	"shipyard/internal/secure"
)

func TestHAProxyAdminCSRFRevisionsAndCleanup(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	newUser := func(admin bool) string {
		id, token := uuid.NewString(), secure.Token()
		if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'test','disabled',$3)", id, id+"@test.invalid", admin); err != nil {
			t.Fatal(err)
		}
		if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id); err != nil {
			t.Fatal(err)
		}
		return token
	}
	admin, member := newUser(true), newUser(false)
	save := func(kind, parent string, data any) model.Resource {
		b, _ := json.Marshal(data)
		r, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: kind, Name: kind, ParentID: parent, Data: b})
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	host := save("server", "", model.Server{})
	app := save("application", "", model.App{ServerID: host.ID})
	route := save("route", app.ID, model.Route{Protocol: "tcp", ListenPort: 15432})
	request := func(method, path, body, token, csrf string) (int, []byte) {
		req, _ := http.NewRequest(method, server.URL+path, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "https://shipyard.test")
		req.Header.Set("X-CSRF-Token", csrf)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return res.StatusCode, b
	}
	path := "/api/v1/servers/" + host.ID + "/haproxy"
	for _, method := range []string{"GET", "PUT"} {
		if status, _ := request(method, path, `{"version":0,"bindings":{}}`, member, "csrf"); status != 403 {
			t.Fatalf("non-admin %s accepted: %d", method, status)
		}
	}
	if status, _ := request("PUT", path, `{"version":0,"bindings":{}}`, admin, ""); status != 403 {
		t.Fatal("CSRF bypass", status)
	}
	if status, _ := request("PUT", path, `{"version":0,"bindings":{"web":["localhost"]}}`, admin, "csrf"); status != 400 {
		t.Fatal("hostname accepted", status)
	}
	if status, _ := request("PUT", path, `{"version":0,"bindings":{"foreign-route":["127.0.0.1"]}}`, admin, "csrf"); status != 400 {
		t.Fatal("foreign frontend accepted", status)
	}
	if status, _ := request("PUT", path, `{"version":1,"bindings":{}}`, admin, "csrf"); status != 409 {
		t.Fatal("stale revision accepted", status)
	}
	status, b := request("GET", path, "", admin, "")
	if status != 200 {
		t.Fatal(status, string(b))
	}
	var state control.ProxyState
	if err := json.Unmarshal(b, &state); err != nil {
		t.Fatal(err)
	}
	if len(state.Frontends) != 2 || state.Image != "haproxy:3.4-alpine" {
		t.Fatal(state)
	}
	if status, _ = request("PUT", path, `{"version":0,"bindings":{"web":["127.0.0.1"]}}`, admin, "csrf"); status != 202 {
		t.Fatal("valid settings not queued", status)
	}
	if status, _ = request("PUT", path, `{"version":0,"bindings":{}}`, admin, "csrf"); status != 409 {
		t.Fatal("duplicate apply queued", status)
	}
	// Deletion removes route-specific overrides, retaining the web setting.
	raw, _ := json.Marshal(control.ProxySettings{Version: 1, Bindings: map[string][]string{"web": {"127.0.0.1"}, route.ID: {"::1"}}})
	if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2)", control.ProxySettingsKey(host.ID), raw); err != nil {
		t.Fatal(err)
	}
	if status, b = request("DELETE", "/api/v1/resources/"+route.ID, "{}", admin, "csrf"); status != 200 {
		t.Fatal(status, string(b))
	}
	state, err := a.Control.ProxyState(ctx, host.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, exists := state.Bindings[route.ID]; exists || state.Version != 2 {
		t.Fatal("deleted frontend retained", state)
	}
	unreferenced := save("server", "", model.Server{})
	if _, err = a.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2)", control.ProxySettingsKey(unreferenced.ID), raw); err != nil {
		t.Fatal(err)
	}
	if status, _ = request("DELETE", "/api/v1/resources/"+unreferenced.ID, "{}", admin, "csrf"); status != 200 {
		t.Fatal(status)
	}
	var exists bool
	_ = a.Store.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM settings WHERE key=$1)", control.ProxySettingsKey(unreferenced.ID)).Scan(&exists)
	if exists {
		t.Fatal("deleted server settings retained")
	}
}
