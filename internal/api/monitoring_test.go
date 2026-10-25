package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"shipyard/internal/secure"
	"shipyard/internal/testcontract"
)

func TestMonitoringAndProxyAdministratorBoundaries(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	newSession := func(admin bool) string {
		uid, token := uuid.NewString(), secure.Token()
		if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'Monitor','disabled',$3)", uid, uid+"@example.com", admin); err != nil {
			t.Fatal(err)
		}
		if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), uid); err != nil {
			t.Fatal(err)
		}
		return token
	}
	admin, member := newSession(true), newSession(false)
	if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO resources(id,kind,name,data) VALUES('monitor-server','server','No samples','{}')"); err != nil {
		t.Fatal(err)
	}
	request := func(method, path, body, token string) (int, []byte) {
		t.Helper()
		req, err := http.NewRequest(method, server.URL+"/api/v1"+path, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", "csrf")
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		raw, err := io.ReadAll(res.Body)
		if err != nil {
			t.Fatal(err)
		}
		testcontract.Response(t, req, res, raw)
		return res.StatusCode, raw
	}
	status, raw := request("POST", "/resources", `{"kind":"proxy","name":"Restricted SOCKS","data":{"scheme":"socks5h","host":"127.0.0.1","port":1080},"secrets":{"username":"hidden-user","password":"hidden-password"}}`, admin)
	if status != 200 || strings.Contains(string(raw), "hidden-") {
		t.Fatal(status, string(raw))
	}
	var proxy struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(raw, &proxy)
	for _, path := range []string{"/monitoring/resources", "/monitoring/defaults", "/monitoring/incidents", "/settings/certificates", "/servers/anything/metrics", "/applications/anything/metrics"} {
		if code, _ := request("GET", path, "", member); code != 403 {
			t.Fatal(path, code)
		}
	}
	if code, body := request("GET", "/resources?kind=proxy", "", member); code != 200 || string(body) != "[]\n" {
		t.Fatal(code, string(body))
	}
	for _, path := range []string{"/monitoring/resources", "/monitoring/defaults", "/monitoring/incidents", "/settings/certificates"} {
		if code, body := request("GET", path, "", admin); code != 200 {
			t.Fatal(path, code, string(body))
		}
	}
	if code, _ := request("GET", "/applications/monitor-server/metrics", "", admin); code != 400 {
		t.Fatal("incorrect resource kind accepted", code)
	}
	if code, _ := request("GET", "/servers/monitor-server/metrics?range=365d", "", admin); code != 400 {
		t.Fatal("unbounded range accepted", code)
	}
	if code, _ := request("PUT", "/settings/certificates", `{"proxyId":"`+proxy.ID+`"}`, admin); code != 200 {
		t.Fatal(code)
	}
	if code, _ := request("DELETE", "/resources/"+proxy.ID, "", admin); code != 409 {
		t.Fatal("referenced proxy deleted", code)
	}
	if code, _ := request("PUT", "/settings/certificates", `{"proxyId":""}`, admin); code != 200 {
		t.Fatal(code)
	}
	if code, _ := request("DELETE", "/resources/"+proxy.ID, "", admin); code != 200 {
		t.Fatal(code)
	}
	if code, _ := request("POST", "/resources", `{"kind":"proxy","name":"Invalid","data":{"scheme":"http","host":"host","port":80}}`, admin); code != 400 {
		t.Fatal(code)
	}
	if code, _ := request("POST", "/resources", `{"kind":"proxy","name":"Leaky","data":{"scheme":"socks5","host":"host","port":80,"password":"plaintext"}}`, admin); code != 400 {
		t.Fatal(code)
	}
	if code, _ := request("POST", "/resources", `{"kind":"webhook","name":"Bale","data":{"provider":"bale","chatId":"@alerts"},"secrets":{"token":"123:secret"}}`, member); code != 403 {
		t.Fatal("non-admin messenger created", code)
	}
	if code, body := request("POST", "/resources", `{"kind":"webhook","name":"Bale","data":{"provider":"bale","chatId":"@alerts"},"secrets":{"token":"123:secret"}}`, admin); code != 200 || strings.Contains(string(body), "123:secret") {
		t.Fatal(code, string(body))
	}
}
