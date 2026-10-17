package api

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"io"
	"net/http"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/secure"
	"strings"
	"testing"
)

type zonePickerDNS struct{}

func (zonePickerDNS) Zones(context.Context) ([]providers.ProviderZone, error) {
	return []providers.ProviderZone{{ID: "real", Name: "Example.COM"}}, nil
}
func (zonePickerDNS) Records(context.Context, string) ([]model.DNSRecord, error) { return nil, nil }
func (zonePickerDNS) Put(_ context.Context, _ string, r model.DNSRecord) (model.DNSRecord, error) {
	return r, nil
}
func (zonePickerDNS) Delete(context.Context, string, string) error { return nil }
func TestNetworkingPortPermissionsAndProviderZoneVerification(t *testing.T) {
	a, server := testAPI(t)
	ctx := context.Background()
	save := func(kind, parent, team string, data any) model.Resource {
		raw, _ := json.Marshal(data)
		r, e := a.Store.Save(ctx, "", model.ResourceInput{Kind: kind, Name: kind, ParentID: parent, TeamID: team, Data: raw})
		if e != nil {
			t.Fatal(e)
		}
		return r
	}
	team := save("team", "", "", map[string]any{})
	project := save("project", team.ID, team.ID, map[string]any{})
	env := save("environment", project.ID, team.ID, map[string]any{})
	host := save("server", "", "", model.Server{})
	other := save("server", "", "", model.Server{})
	git := save("git", "", "", model.Git{})
	for _, id := range []string{host.ID, git.ID} {
		_, _ = a.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", id, team.ID)
	}
	spec := model.App{Engine: "dockerfile", ServerID: host.ID, GitID: git.ID, Repository: "owner/repo", Branch: "main", Context: ".", File: "Dockerfile"}
	app := save("application", env.ID, team.ID, spec)
	network := save("network", host.ID, "", model.Network{ServerID: host.ID, Status: "ready"})
	remoteNetwork := save("network", other.ID, "", model.Network{ServerID: other.ID, Status: "ready"})
	session := func(role string, admin bool) string {
		id, token := uuid.NewString(), secure.Token()
		if _, e := a.Store.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES($1,$2,'user','disabled',$3)", id, id+"@test.invalid", admin); e != nil {
			t.Fatal(e)
		}
		_, _ = a.Store.Pool.Exec(ctx, "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3)", project.ID, id, role)
		_, _ = a.Store.Pool.Exec(ctx, "INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour')", secure.Hash(token), id)
		return token
	}
	admin, operator, viewer := session("owner", true), session("operator", false), session("viewer", false)
	request := func(method, path string, body any, token string) (int, []byte) {
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, server.URL+"/api/v1"+path, strings.NewReader(string(raw)))
		req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		req.Header.Set("X-CSRF-Token", "csrf")
		req.Header.Set("Content-Type", "application/json")
		res, e := server.Client().Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return res.StatusCode, b
	}
	ports := map[string]any{"version": 1, "services": map[string][]model.PublishedPort{"app": {{Host: "0.0.0.0", Published: 9000, Target: 8080, Protocol: "tcp"}}}}
	if code, body := request("PUT", "/applications/"+app.ID+"/published-ports", ports, operator); code != 403 {
		t.Fatal("operator published host port", code, string(body))
	}
	if code, body := request("PUT", "/applications/"+app.ID+"/published-ports", ports, admin); code != 200 {
		t.Fatal(code, string(body))
	}
	current, _ := a.Store.Resource(ctx, app.ID)
	spec.PublishedPorts = map[string][]model.PublishedPort{"app": {{Host: "0.0.0.0", Published: 9001, Target: 8080, Protocol: "tcp"}}}
	if code, body := request("PUT", "/resources/"+app.ID, map[string]any{"name": app.Name, "kind": "application", "version": current.Version, "data": spec}, operator); code != 403 {
		t.Fatal("generic write bypassed port permissions", code, string(body))
	}
	services := func(id string) map[string]model.ServiceNetworking {
		return map[string]model.ServiceNetworking{"app": {Hostname: "api-internal", Connections: []model.NetworkAttachment{{NetworkID: id}}}}
	}
	input := map[string]any{"version": current.Version, "services": services(network.ID)}
	if code, _ := request("PUT", "/applications/"+app.ID+"/networking", input, viewer); code != 403 {
		t.Fatal("viewer changed network", code)
	}
	if code, body := request("PUT", "/applications/"+app.ID+"/networking", input, operator); code != 400 {
		t.Fatal("ungranted network allowed", code, string(body))
	}
	for _, id := range []string{network.ID, remoteNetwork.ID} {
		_, _ = a.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", id, team.ID)
	}
	input["services"] = services(remoteNetwork.ID)
	if code, _ := request("PUT", "/applications/"+app.ID+"/networking", input, operator); code != 400 {
		t.Fatal("other-server network allowed", code)
	}
	input["services"] = services(network.ID)
	if code, body := request("PUT", "/applications/"+app.ID+"/networking", input, operator); code != 200 {
		t.Fatal(code, string(body))
	}
	if code, _ := request("PUT", "/applications/"+app.ID+"/networking", input, operator); code != 409 {
		t.Fatal("stale networking revision allowed", code)
	}
	dns := save("dns", "", "", model.DNS{Provider: "cloudflare"})
	a.Control.DNSFactory = func(string, string) providers.DNSProvider { return zonePickerDNS{} }
	zoneInput := map[string]any{"kind": "zone", "parentId": dns.ID, "data": model.Zone{ProviderZoneID: "real", Domain: "evil.example"}}
	code, body := request("POST", "/resources", zoneInput, admin)
	if code != 200 {
		t.Fatal(code, string(body))
	}
	var zone model.Resource
	if e := json.Unmarshal(body, &zone); e != nil {
		t.Fatal(e)
	}
	z, _ := model.Decode[model.Zone](zone)
	if z.Domain != "example.com" || zone.Name != "example.com" {
		t.Fatal("client-controlled zone identity", zone)
	}
	zoneInput["data"] = model.Zone{ProviderZoneID: "forged", Domain: "example.com"}
	if code, _ := request("POST", "/resources", zoneInput, admin); code != 400 {
		t.Fatal("unknown provider zone accepted", code)
	}
	for _, protocol := range []string{"http", "https", "grpc", "tcp"} {
		route := map[string]any{"protocol": protocol, "domain": "api.example.com", "zoneId": zone.ID, "targetPort": 8080, "listenPort": 15432, "service": "app", "tls": "off"}
		if code, _ := request("POST", "/resources", map[string]any{"kind": "route", "name": "insecure", "parentId": app.ID, "data": route}, admin); code != 400 {
			t.Fatal("insecure route accepted", protocol, code)
		}
	}
	for _, field := range []string{"backendTls", "backendServerName", "redirect", "path", "stripPrefix"} {
		route := map[string]any{"protocol": "https", "tls": "terminate", "domain": "API.EXAMPLE.COM.", "zoneId": zone.ID, "service": "app", "targetPort": 8080, field: true}
		if code, _ := request("POST", "/resources", map[string]any{"kind": "route", "name": "legacy", "parentId": app.ID, "data": route}, admin); code != 400 {
			t.Fatal("obsolete field accepted", field, code)
		}
	}
}
