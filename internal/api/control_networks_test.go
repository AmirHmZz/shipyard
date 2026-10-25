package api

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"shipyard/internal/secure"
)

func TestControlPlaneNetworkPermissionsAndDisabledInstallation(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	account := func(admin bool) string {
		id, token := uuid.NewString(), secure.Token()
		if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'test','disabled',$3)", id, id+"@test.invalid", admin); err != nil {
			t.Fatal(err)
		}
		if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id); err != nil {
			t.Fatal(err)
		}
		return token
	}
	admin, viewer := account(true), account(false)
	request := func(method, path, body, token, csrf string) (int, string) {
		req, _ := http.NewRequest(method, server.URL+"/api/v1"+path, strings.NewReader(body))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("X-CSRF-Token", csrf)
		req.Header.Set("Content-Type", "application/json")
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		return res.StatusCode, string(raw)
	}
	read, write := "/settings/control-plane-networks", "/networks/"+uuid.NewString()+"/control-plane"
	if status, body := request("GET", read, "", viewer, "csrf"); status != 403 {
		t.Fatal(status, body)
	}
	if status, body := request("PUT", write, `{"attached":true}`, viewer, "csrf"); status != 403 {
		t.Fatal(status, body)
	}
	if status, body := request("PUT", write, `{"attached":true}`, admin, ""); status != 403 {
		t.Fatal(status, body)
	}
	if status, body := request("GET", read, "", admin, "csrf"); status != 200 || !strings.Contains(body, `"available":false`) || !strings.Contains(body, `"networks":[]`) {
		t.Fatal(status, body)
	}
	for _, body := range []string{`{}`, `{"attached":null}`, `{"attached":"true"}`, `{"attached":true,"extra":true}`, `{"attached":true}`} {
		if status, raw := request("PUT", write, body, admin, "csrf"); status != 400 {
			t.Fatal(status, raw)
		}
	}
	var selections int
	if err := a.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM settings WHERE starts_with(key,'control-plane-network:')").Scan(&selections); err != nil || selections != 0 {
		t.Fatal("rejected request saved an attachment", selections, err)
	}
}
