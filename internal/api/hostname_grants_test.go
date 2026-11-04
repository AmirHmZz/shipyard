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
	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/secure"
)

func TestHostnameGrantsUseTheApplicationTeam(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := a.Store.Pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	save := func(kind, parent, team string, data any) model.Resource {
		t.Helper()
		raw, _ := json.Marshal(data)
		res, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: kind, Name: kind, ParentID: parent, TeamID: team, Data: raw})
		if err != nil {
			t.Fatal(err)
		}
		return res
	}
	team := save("team", "", "", nil)
	other := save("team", "", "", nil)
	project := save("project", team.ID, team.ID, nil)
	env := save("environment", project.ID, team.ID, nil)
	host := save("server", "", "", model.Server{})
	git := save("git", "", "", model.Git{})
	zone := save("zone", "", "", model.Zone{Domain: "example.com", ProviderZoneID: "example"})
	unrelated := save("zone", "", "", model.Zone{Domain: "other.example", ProviderZoneID: "other"})
	spec := model.App{Engine: "dockerfile", ServerID: host.ID, GitID: git.ID, Repository: "team/repo", Branch: "main", Context: ".", File: "Dockerfile"}
	app := save("application", env.ID, team.ID, spec)
	for _, resource := range []model.Resource{host, git} {
		exec("INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", resource.ID, team.ID)
	}
	newSession := func(admin bool) (string, string) {
		id, token := uuid.NewString(), secure.Token()
		exec("INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'test','disabled',$3)", id, id+"@test.invalid", admin)
		exec("INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id)
		return id, token
	}
	_, admin := newSession(true)
	memberID, member := newSession(false)
	exec("INSERT INTO team_members(team_id,user_id,role) VALUES($1,$3,'owner'),($2,$3,'owner')", team.ID, other.ID, memberID)

	request := func(method, path, token string, body any, want int) string {
		t.Helper()
		raw, _ := json.Marshal(body)
		req, err := http.NewRequest(method, server.URL+"/api/v1"+path, bytes.NewReader(raw))
		if err != nil {
			t.Fatal(err)
		}
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("X-CSRF-Token", "csrf")
		req.Header.Set("Content-Type", "application/json")
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		response, err := io.ReadAll(res.Body)
		if err != nil || res.StatusCode != want {
			t.Fatalf("%s %s returned %d, want %d: %s (%v)", method, path, res.StatusCode, want, response, err)
		}
		return string(response)
	}
	zonePath := "/zones/" + zone.ID
	grantsPath := zonePath + "/grants"
	teamGrantPath := grantsPath + "/" + team.ID
	scoped := db.ZoneGrant{Mode: "scoped", Patterns: []string{"api.example.com", "*.preview.example.com"}}
	request("PUT", teamGrantPath, member, scoped, 403)
	request("PUT", teamGrantPath, admin, db.ZoneGrant{Mode: "scoped", Patterns: []string{"badexample.com"}}, 400)
	request("PUT", teamGrantPath, admin, scoped, 200)
	legacyPath := "/resources/" + zone.ID + "/grants"
	legacyGrant := map[string]any{"teamId": other.ID, "granted": true}
	request("POST", legacyPath, admin, legacyGrant, 200)
	legacy := request("GET", legacyPath, admin, nil, 200)
	if strings.Contains(legacy, team.ID) || !strings.Contains(legacy, other.ID) {
		t.Fatalf("legacy grant listing should include only whole-zone grants: %s", legacy)
	}
	legacyGrant["teamId"] = team.ID
	request("POST", legacyPath, admin, legacyGrant, 409)
	request("PUT", "/zones/"+unrelated.ID+"/grants/"+other.ID, admin, db.ZoneGrant{Mode: "whole"}, 200)
	appZones := request("GET", "/applications/"+app.ID+"/domain-access", member, nil, 200)
	var zones []db.ZoneAccess
	if err := json.Unmarshal([]byte(appZones), &zones); err != nil || len(zones) != 1 || zones[0].ZoneID != zone.ID || zones[0].Mode != "scoped" {
		t.Fatalf("unexpected team domain access: %s (%v)", appZones, err)
	}
	for _, entry := range []struct{ method, path string }{
		{"GET", zonePath + "/records"}, {"POST", zonePath + "/records"},
		{"PUT", zonePath + "/records/record"}, {"DELETE", zonePath + "/records/record"},
		{"GET", grantsPath}, {"GET", "/zones/" + unrelated.ID + "/records"},
	} {
		request(entry.method, entry.path, member, map[string]any{}, 403)
	}
	for _, tc := range []struct {
		name string
		want int
	}{
		{"example.com", 400},
		{"sibling.example.com", 400},
		{"*.example.com", 400},
		{"preview.example.com", 400},
		{"api.example.com", 200},
		{"*.nested.preview.example.com", 200},
	} {
		raw, _ := json.Marshal(model.Route{Protocol: "https", TLS: "terminate", Domain: tc.name, ZoneID: zone.ID, TargetPort: 8080})
		response := request("POST", "/resources", member, model.ResourceInput{Kind: "route", TeamID: other.ID, ParentID: app.ID, Data: raw}, tc.want)
		if tc.want == 200 {
			var route model.Resource
			if err := json.Unmarshal([]byte(response), &route); err != nil || route.TeamID != team.ID {
				t.Fatalf("route was not assigned to its application's team: %s (%v)", response, err)
			}
			request("POST", "/routes/"+route.ID+"/sync", member, map[string]string{"mode": "replace"}, 403)
		}
	}
	otherProject := save("project", other.ID, other.ID, nil)
	otherEnv := save("environment", otherProject.ID, other.ID, nil)
	otherApp := save("application", otherEnv.ID, other.ID, spec)
	duplicate, _ := json.Marshal(model.Route{Protocol: "https", TLS: "terminate", Domain: "api.example.com", ZoneID: zone.ID, TargetPort: 8080})
	request("POST", "/resources", member, model.ResourceInput{Kind: "route", ParentID: otherApp.ID, Data: duplicate}, 409)
	spec.Previews, spec.PreviewZoneID = true, zone.ID
	spec.PreviewRouting = &model.PreviewRouting{Mode: "target", Service: "app", Port: 8080}
	for _, tc := range []struct {
		name string
		want int
	}{
		{"*.example.com", 400},
		{"*.preview.example.com", 200},
	} {
		spec.PreviewDomain = tc.name
		raw, _ := json.Marshal(spec)
		request("PUT", "/resources/"+app.ID, member, model.ResourceInput{Kind: "application", Name: app.Name, Version: app.Version, Data: raw}, tc.want)
	}
	if response := request("PUT", teamGrantPath, admin, db.ZoneGrant{Mode: "none"}, 409); !strings.Contains(response, "preview.example.com") {
		t.Fatalf("missing blocking preview: %s", response)
	}
}
