package api

import (
	"bytes"
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

func TestHandlerResponseContracts(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	uid, token := uuid.NewString(), secure.Token()
	if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,'contracts@example.com','Contracts','disabled',true)", uid); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), uid); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Store.Pool.Exec(ctx, `INSERT INTO resources(id,kind,name,data) VALUES('contract-app','application','App','{}'),('contract-network','network','Network','{}'),('contract-route','route',NULL,'{"domain":"app.example.com","zoneId":"missing-zone","tls":"terminate"}')`); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		method, path, body string
		status             int
	}{
		{"GET", "/version", "", 200}, {"GET", "/auth/status", "", 200}, {"GET", "/settings/updates", "", 200},
		{"GET", "/applications/contract-app/networking", "", 200}, {"GET", "/applications/contract-app/published-ports", "", 200},
		{"GET", "/applications/contract-app/runtime", "", 200}, {"GET", "/routes/contract-route/status", "", 200},
		{"GET", "/users", "", 200}, {"GET", "/jobs", "", 200}, {"GET", "/audit", "", 200},
		{"PUT", "/applications/contract-app/networking", `{"version":1,"services":{},"pending":true}`, 400},
		{"PUT", "/settings/alerts", `{"cpu":90,"memory":90,"disk":90,"sustainedSeconds":300,"offlineSeconds":60,"unknown":true}`, 400},
		{"GET", "/resources/missing", "", 404},
		{"DELETE", "/resources/contract-network", "", 202},
	}
	for _, tc := range cases {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			request, err := http.NewRequest(tc.method, server.URL+"/api/v1"+tc.path, strings.NewReader(tc.body))
			if err != nil {
				t.Fatal(err)
			}
			request.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("X-CSRF-Token", "csrf")
			response, err := server.Client().Do(request)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			raw, err := io.ReadAll(response.Body)
			if err != nil {
				t.Fatal(err)
			}
			if response.StatusCode != tc.status {
				t.Fatalf("%d: %s", response.StatusCode, raw)
			}
			testcontract.Response(t, request, response, raw)
			if tc.path == "/routes/contract-route/status" {
				var state map[string]json.RawMessage
				if err = json.Unmarshal(raw, &state); err != nil {
					t.Fatal(err)
				}
				if !bytes.Equal(state["dns"], []byte(`"pending"`)) || !bytes.Equal(state["records"], []byte(`[]`)) {
					t.Fatal(string(raw))
				}
			}
		})
	}
	// The version identity must also be readable without a session.
	response, err := server.Client().Get(server.URL + "/api/v1/version")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatal(response.StatusCode)
	}
	request, _ := http.NewRequest("GET", server.URL+"/api/v1/resources", nil)
	response, err = server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 401 {
		t.Fatal(response.StatusCode, string(raw))
	}
	testcontract.Response(t, request, response, raw)
}
