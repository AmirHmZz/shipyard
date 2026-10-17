package api

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"io"
	"net/http"
	"shipyard/internal/platformupdate"
	"shipyard/internal/secure"
	"strings"
	"testing"
)

func TestSystemUpdateAuthorizationAndSecretRedaction(t *testing.T) {
	a, server := testAPI(t)
	a.Updates = &platformupdate.Service{Store: a.Store}
	ctx := context.Background()
	admin, viewer := secure.Token(), secure.Token()
	for _, u := range []struct {
		token string
		admin bool
	}{{admin, true}, {viewer, false}} {
		id := uuid.NewString()
		a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'test','disabled',$3)", id, id+"@test.invalid", u.admin)
		a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(u.token), id)
	}
	id := uuid.NewString()
	o := platformupdate.Operation{ID: id, State: "queued", Cipher: []byte("private-passphrase-cipher")}
	if e := platformupdate.Save(ctx, a.Store, o); e != nil {
		t.Fatal(e)
	}
	for _, endpoint := range []struct{ method, path string }{{"GET", ""}, {"POST", "/check"}, {"POST", "/plan"}, {"POST", ""}, {"GET", "/" + id}, {"GET", "/" + id + "/backup"}} {
		for _, token := range []string{"", viewer} {
			req, _ := http.NewRequest(endpoint.method, server.URL+"/api/v1/settings/updates"+endpoint.path, strings.NewReader(`{}`))
			if token != "" {
				req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Origin", a.Origin)
			req.Header.Set("X-CSRF-Token", "csrf")
			res, e := http.DefaultClient.Do(req)
			if e != nil {
				t.Fatal(e)
			}
			res.Body.Close()
			if res.StatusCode != 401 && res.StatusCode != 403 {
				t.Fatalf("%s %s authorized nonadmin: %d", endpoint.method, endpoint.path, res.StatusCode)
			}
		}
	}
	req, _ := http.NewRequest("GET", server.URL+"/api/v1/settings/updates/"+id, nil)
	req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: admin})
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	var public map[string]any
	json.Unmarshal(b, &public)
	if res.StatusCode != 200 || public["cipher"] != nil || strings.Contains(string(b), "private-passphrase") {
		t.Fatal(res.StatusCode, string(b))
	}
}

func TestHTTPChallengePathNeverFallsBackToDashboard(t *testing.T) {
	_, s := testAPI(t)
	for _, path := range []string{"/.well-known/acme-challenge/a-token-long-enough", "/.well-known/acme-challenge/a-token-long-enough/extra"} {
		res, e := http.Get(s.URL + path)
		if e != nil {
			t.Fatal(e)
		}
		res.Body.Close()
		if res.StatusCode != 404 {
			t.Fatal(path, res.StatusCode)
		}
	}
}
