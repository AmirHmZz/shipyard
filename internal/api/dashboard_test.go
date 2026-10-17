package api

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"io"
	"net/http"
	"shipyard/internal/certs"
	"shipyard/internal/control"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"shipyard/internal/secure"
	"strings"
	"testing"
)

func TestDashboardAccessPermissionsOriginsAndProtectedResources(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	a.Control.Local = remote.NewDocker("/unused-test-socket", "executor")
	a.Origin = "https://shipyard.example.com"
	_, _ = a.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES('dashboard-access',$1)", json.RawMessage(`{"activeDomain":"shipyard.example.com","version":0}`))
	save := func(id, kind string, data any) model.Resource {
		raw, _ := json.Marshal(data)
		r, e := a.Store.Save(ctx, id, model.ResourceInput{Kind: kind, Name: kind, Data: raw})
		if e != nil {
			t.Fatal(e)
		}
		return r
	}
	save(control.LocalServerID, "server", model.Server{Connection: "local", DaemonID: "engine-1"})
	save(control.DashboardID, "system", map[string]any{"serverId": control.LocalServerID, "gateway": "127.0.0.1", "address": "172.20.0.2", "port": 8080})
	_ = save("", "zone", model.Zone{Domain: "example.com", ProviderZoneID: "example"})
	account := func(admin bool) string {
		id, token := uuid.NewString(), secure.Token()
		if _, e := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'test','disabled',$3)", id, id+"@test.invalid", admin); e != nil {
			t.Fatal(e)
		}
		if _, e := a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id); e != nil {
			t.Fatal(e)
		}
		return token
	}
	admin, viewer := account(true), account(false)
	request := func(method, path, body, token, origin, host, proto, csrf string) (int, []byte) {
		req, _ := http.NewRequest(method, server.URL+path, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		req.Header.Set("Origin", origin)
		req.Header.Set("X-Forwarded-Proto", proto)
		if host != "" {
			req.Host = host
		}
		res, e := http.DefaultClient.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return res.StatusCode, b
	}
	path := "/api/v1/settings/dashboard-access"
	for _, method := range []string{"GET", "PUT"} {
		if status, b := request(method, path, `{}`, viewer, "https://shipyard.example.com", "shipyard.example.com", "http", "csrf"); status != 403 {
			t.Fatalf("viewer %s: %d %s", method, status, b)
		}
	}
	body := `{"version":0,"domain":"shipyard.example.com"}`
	invalid := `{"version":0,"domain":"shipyard.example.com","acmeEmail":"admin@example.com","acceptTos":false}`
	if status, _ := request("PUT", path, invalid, admin, "https://shipyard.example.com", "shipyard.example.com", "http", "csrf"); status != 400 {
		t.Fatal("missing certificate consent accepted", status)
	}
	body = `{"version":0,"domain":"shipyard.example.com","acmeEmail":"admin@example.com","acceptTos":true}`
	if status, _ := request("PUT", path, body, admin, "https://evil.test", "shipyard.example.com", "http", "csrf"); status != 403 {
		t.Fatal("foreign origin allowed", status)
	}
	if status, _ := request("PUT", path, body, admin, "https://shipyard.example.com", "shipyard.example.com", "http", ""); status != 403 {
		t.Fatal("CSRF bypass", status)
	}
	status, b := request("PUT", path, body, admin, "https://shipyard.example.com", "shipyard.example.com", "http", "csrf")
	if status != 202 {
		t.Fatalf("setup: %d %s", status, b)
	}
	var queued struct {
		JobID string `json:"jobId"`
	}
	json.Unmarshal(b, &queued)
	var n int
	if e := a.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE id=$1 AND kind='dashboard-apply'", queued.JobID).Scan(&n); e != nil || n != 1 {
		t.Fatal("job and settings not persisted", n, e)
	}
	issuer := &certs.ACME{Store: a.Store}
	config, err := issuer.Configuration(ctx)
	if err != nil || config.Email != "admin@example.com" || !config.AcceptTOS {
		t.Fatal("certificate settings not saved", config, err)
	}
	if status, _ := request("PUT", path, body, admin, "https://shipyard.example.com", "shipyard.example.com", "http", "csrf"); status != 409 {
		t.Fatal("stale revision allowed", status)
	}
	s, e := a.Control.Dashboard(ctx)
	if e != nil || s.Version != 1 || s.Origin != "https://shipyard.example.com" {
		t.Fatal(s, e)
	}
	reserved, _ := json.Marshal(model.Route{Protocol: "https", Domain: s.Domain, TLS: "terminate", TargetPort: 8080})
	if _, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: "route", Name: "collision", Data: reserved}); err == nil {
		t.Fatal("pending dashboard hostname was not reserved")
	}
	for _, id := range []string{control.LocalServerID, control.DashboardID, s.RouteID} {
		if status, _ := request("DELETE", "/api/v1/resources/"+id, `{}`, admin, "https://shipyard.example.com", "shipyard.example.com", "http", "csrf"); status != 403 {
			t.Fatal("protected resource deleted", id, status)
		}
	}
	if status, _ := request("POST", "/api/v1/resources", `{"kind":"server","name":"fake","data":{"connection":"local","daemonId":"fake"}}`, admin, "https://shipyard.example.com", "shipyard.example.com", "http", "csrf"); status != 403 {
		t.Fatal("local transport forged", status)
	}
	raw, _ := json.Marshal(map[string]any{"version": 2, "domain": "shipyard.example.com", "activeDomain": "shipyard.example.com", "bootstrapEnabled": false})
	if _, e = a.Store.Pool.Exec(ctx, "UPDATE settings SET value=$2 WHERE key=$1", "dashboard-access", raw); e != nil {
		t.Fatal(e)
	}
	req, _ := http.NewRequest("GET", server.URL, nil)
	if a.allowedOrigin(req, "http://localhost:8080") || a.canonicalOrigin(ctx) != "https://shipyard.example.com" {
		t.Fatal("obsolete bootstrap origin retained")
	}
}
