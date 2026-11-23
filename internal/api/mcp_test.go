package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/netip"
	"net/url"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"shipyard/internal/control"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"shipyard/internal/secure"
	"shipyard/internal/testcontract"
)

type mcpTestTransport struct {
	http.RoundTripper
	token string
}

type mcpRuntimeNode struct {
	remote.Node
	calls atomic.Int32
	onRun func()
}

func (*mcpRuntimeNode) Close() error { return nil }

func (n *mcpRuntimeNode) Run(_ context.Context, command string, _ io.Reader, output io.Writer) error {
	n.calls.Add(1)
	if command != remote.Command("docker", "logs", "--timestamps", "--tail", "100", "--", "web-1") {
		panic("unexpected Docker command")
	}
	if n.onRun != nil {
		n.onRun()
	}
	_, err := io.WriteString(output, "2026-01-01T12:00:00.125Z ready, password=private-value\n")
	return err
}

func (t mcpTestTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	r.Header.Set("Authorization", "Bearer "+t.token)
	return t.RoundTripper.RoundTrip(r)
}

func TestMCPAuthenticationAndScope(t *testing.T) {
	a, plaintext := testAPI(t)
	tls := httptest.NewTLSServer(a.Router())
	defer tls.Close()
	ctx := t.Context()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := a.Store.Pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	resource := func(kind, name, team, parent, data string) string {
		t.Helper()
		id := uuid.NewString()
		exec("INSERT INTO resources(id,kind,name,team_id,parent_id,data) VALUES($1,$2,$3,$4,$5,$6)", id, kind, name, team, parent, data)
		return id
	}
	team := resource("team", "Ops", "", "", "{}")
	project := resource("project", "Prod", team, team, "{}")
	project2 := resource("project", "Shared", team, team, "{}")
	foreign := resource("project", "Secret", team, team, "{}")
	env := resource("environment", "Production", team, project, "{}")
	env2 := resource("environment", "Production", team, project2, "{}")
	foreignEnv := resource("environment", "Staging", team, foreign, "{}")
	app := resource("application", "Web", team, env, "{}")
	job := resource("application", "Backups", team, env2, `{"workload":"job"}`)
	other := resource("application", "Hidden", team, foreignEnv, "{}")
	admin, viewer := uuid.NewString(), uuid.NewString()
	exec("INSERT INTO users(id,email,name,password,admin) VALUES($1,'admin@example.test','Admin','none',true),($2,'viewer@example.test','Viewer','none',false)", admin, viewer)
	exec("INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES($1,$2,'csrf',now()+interval '1 hour'),($3,$4,'csrf',now()+interval '1 hour')",
		secure.Hash("admin-cookie"), admin, secure.Hash("viewer-cookie"), viewer)
	deployment, foreignDeployment := uuid.NewString(), uuid.NewString()
	exec("INSERT INTO deployments(id,app_id,state,commit_sha,snapshot) VALUES($1,$2,'failed','abcdef',''::bytea),($3,$4,'failed','hidden',''::bytea)",
		deployment, app, foreignDeployment, other)
	exec("INSERT INTO events(deployment_id,message) VALUES($1,'100% FAILURE'),($1,'100% retry failure'),($2,'100% hidden failure')", deployment, foreignDeployment)
	run, foreignRun := uuid.NewString(), uuid.NewString()
	exec("INSERT INTO job_runs(id,app_id,release_id,state,trigger,policy) VALUES($1,$2,'release','failed','manual','{}'),($3,$4,'release','failed','manual','{}')",
		run, job, foreignRun, other)
	exec("INSERT INTO job_attempts(run_id,number,container,state,exit_code,logs_complete) VALUES($1,1,'job-1','failed',7,true),($1,2,'job-2','failed',8,false)", run)
	exec("INSERT INTO job_run_events(run_id,attempt,message) VALUES($1,1,'100% job failure'),($1,2,'Attempt two'),($2,1,'100% foreign job failure')", run, foreignRun)
	server, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: "server", Name: "Test Docker", Data: json.RawMessage("{}")})
	if err != nil {
		t.Fatal(err)
	}
	release := model.Release{
		ID: uuid.NewString(), AppID: app, DeploymentID: deployment, ServerID: server.ID,
		Containers: []string{"web-1", "web-2"}, Env: map[string]string{"PASSWORD": "private-value"},
	}
	if err := a.Store.SaveRelease(ctx, release); err != nil {
		t.Fatal(err)
	}
	exec("INSERT INTO app_runtime(app_id,release_id) VALUES($1,$2)", app, release.ID)
	var removeRuntimeAccess atomic.Bool
	node := &mcpRuntimeNode{onRun: func() {
		if removeRuntimeAccess.Load() {
			exec("DELETE FROM project_members WHERE user_id=$1 AND project_id=$2", viewer, project)
		}
	}}
	a.Control.DialNode = func(context.Context, model.Server, map[string]string) (remote.Node, error) { return node, nil }

	request := func(server *httptest.Server, method, path, body, token, cookie, csrf, origin string) (int, string) {
		t.Helper()
		req, err := http.NewRequestWithContext(ctx, method, server.URL+path, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json, text/event-stream")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if cookie != "" {
			req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: cookie})
		}
		if csrf != "" {
			req.Header.Set("X-CSRF-Token", csrf)
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
			req.Header.Set("X-Forwarded-Proto", "https")
		}
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		content, err := io.ReadAll(res.Body)
		if err != nil || !slices.Contains(strings.Split(res.Header.Get("Cache-Control"), ", "), "no-store") {
			t.Fatalf("invalid protected response: %v %+v", err, res.Header)
		}
		return res.StatusCode, string(content)
	}
	check := func(actual, expected int, body string) {
		t.Helper()
		if actual != expected {
			t.Fatalf("got HTTP %d, expected %d: %s", actual, expected, body)
		}
	}
	const settings = "/api/v1/settings/mcp-tokens"
	create, _ := json.Marshal(map[string]any{"name": "Nightly triage", "projectIds": []string{project, project2}})
	status, body := request(tls, "POST", settings, string(create), "", "admin-cookie", "", "")
	check(status, 403, body)
	status, body = request(tls, "POST", settings, string(create), "", "viewer-cookie", "csrf", "")
	check(status, 400, body)
	status, body = request(tls, "POST", settings, string(create), "", "admin-cookie", "csrf", "")
	check(status, 201, body)
	var issued mcpIssuedToken
	contract := testcontract.Document(t)
	var response any
	if err := json.Unmarshal([]byte(body), &response); err != nil {
		t.Fatal(err)
	}
	if err := contract.Components.Schemas["MCPIssuedToken"].Value.VisitJSON(response); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(body), &issued); err != nil || !strings.HasPrefix(issued.Secret, "syd_mcp_") {
		t.Fatalf("invalid creation result: %v", err)
	}
	status, body = request(tls, "GET", settings, "", "", "admin-cookie", "", "")
	check(status, 200, body)
	if strings.Contains(body, issued.Secret) || strings.Contains(body, secure.Hash(issued.Secret)) {
		t.Fatal("token inventory exposed credentials")
	}
	const discovery = `{"jsonrpc":"2.0","id":1,"method":"server/discover"}`
	for _, method := range []string{"GET", "POST", "DELETE", "OPTIONS"} {
		status, body := request(tls, method, "/mcp", discovery, "", "admin-cookie", "", "")
		check(status, 401, body)
	}
	status, body = request(tls, "POST", "/mcp", discovery, "syd_mcp_"+secure.Token(), "", "", "")
	check(status, 401, body)
	status, body = request(plaintext, "POST", "/mcp", discovery, issued.Secret, "", "", "https://shipyard.test")
	check(status, 403, body)
	status, body = request(tls, "POST", "/mcp", discovery, issued.Secret, "", "", "https://foreign.test")
	check(status, 403, body)
	status, body = request(tls, "GET", settings, "", issued.Secret, "", "", "")
	check(status, 401, body)

	proxyAPI := &API{
		Store: a.Store, Control: a.Control, Logger: a.Logger, MCPTrustedProxy: netip.MustParseAddr("127.0.0.1"),
	}
	upstreamServer := httptest.NewUnstartedServer(proxyAPI.Router())
	defer upstreamServer.Close()
	upstream, err := url.Parse("http://" + upstreamServer.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	proxy := httptest.NewUnstartedServer(&httputil.ReverseProxy{Rewrite: func(r *httputil.ProxyRequest) {
		r.SetURL(upstream)
		r.Out.Host = r.In.Host
		r.SetXForwarded()
	}})
	defer proxy.Close()
	// This is the same TLS termination and forwarded-header boundary used by
	// a separately managed dashboard proxy.
	proxyAPI.Origin = "https://" + proxy.Listener.Addr().String()
	upstreamServer.Start()
	proxy.StartTLS()
	httpClient := *proxy.Client()
	httpClient.Transport = mcpTestTransport{RoundTripper: httpClient.Transport, token: issued.Secret}
	client := mcp.NewClient(&mcp.Implementation{Name: "mcp-test", Version: "v1"}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{Endpoint: proxy.URL + "/mcp", HTTPClient: &httpClient}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	tools, err := session.ListTools(ctx, nil)
	if err != nil || len(tools.Tools) != 16 {
		t.Fatalf("cannot list all MCP tools: %+v %v", tools, err)
	}
	call := func(name string, input map[string]any, wantError bool) string {
		t.Helper()
		result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: input})
		if err != nil || result.IsError != wantError {
			t.Fatalf("%s unexpected result %+v %v", name, result, err)
		}
		encoded, _ := json.Marshal(result)
		return string(encoded)
	}
	requireContains := func(out string, wants ...string) {
		t.Helper()
		for _, want := range wants {
			if !strings.Contains(out, want) {
				t.Fatalf("expected %q in %s", want, out)
			}
		}
	}
	forbid := func(out string, values ...string) {
		t.Helper()
		for _, value := range values {
			if strings.Contains(out, value) {
				t.Fatalf("unexpected %q in %s", value, out)
			}
		}
	}
	apps := call("list_applications", map[string]any{}, false)
	requireContains(apps, app, job)
	forbid(apps, other, "Hidden")
	filtered := call("list_applications", map[string]any{"projectName": "prod", "environmentName": "production"}, false)
	requireContains(filtered, app, "Prod", "Production")
	forbid(filtered, job)
	requireContains(call("list_deployments", map[string]any{"status": "failed"}, false), deployment, "abcdef")
	forbid(call("list_deployments", map[string]any{"projectId": foreign}, false), foreignDeployment)
	jobs := call("list_job_runs", map[string]any{"since": "2020-01-01T00:00:00Z"}, false)
	requireContains(jobs, run, "exitCode", "run=")
	forbid(jobs, foreignRun)
	deployPage := call("read_deployment_logs", map[string]any{"deploymentId": deployment, "limit": 1}, false)
	requireContains(deployPage, "100% FAILURE", "nextAfter", "retentionDays")
	forbid(deployPage, "100% retry failure")
	var firstID int64
	if err := a.Store.Pool.QueryRow(ctx, "SELECT min(id) FROM events WHERE deployment_id=$1", deployment).Scan(&firstID); err != nil {
		t.Fatal(err)
	}
	requireContains(call("read_deployment_logs", map[string]any{"deploymentId": deployment, "after": firstID}, false), "100% retry failure")
	requireContains(call("read_deployment_logs", map[string]any{"deploymentId": foreignDeployment}, true), "Resource not found")
	requireContains(call("read_job_logs", map[string]any{"applicationId": job, "runId": run, "attempt": 2}, false), "Attempt two", "captureIncomplete")
	requireContains(call("read_job_logs", map[string]any{"applicationId": app, "runId": run}, true), "Resource not found")
	requireContains(call("read_runtime_logs", map[string]any{"applicationId": other, "container": "other"}, true), "Resource not found")
	requireContains(call("read_runtime_logs", map[string]any{"applicationId": app, "container": "foreign-container"}, true), "Resource not found")
	runtime := call("read_runtime_logs", map[string]any{"applicationId": app}, false)
	requireContains(runtime, "2026-01-01T12:00:00.125Z", "password=[REDACTED]", "web-1", "web-2")
	forbid(runtime, "private-value")
	if calls := node.calls.Load(); calls != 1 {
		t.Fatalf("expected only one Docker log read, got %d", calls)
	}
	search := call("search_logs", map[string]any{"query": "100% FAILURE"}, false)
	requireContains(search, "100% FAILURE")
	forbid(search, "hidden failure")
	search = call("search_logs", map[string]any{"query": "100%", "limit": 1}, false)
	requireContains(search, "nextCursor", "truncated")
	forbid(search, "foreign job")
	var searchResult struct {
		StructuredContent struct{ NextCursor string }
	}
	if err := json.Unmarshal([]byte(search), &searchResult); err != nil {
		t.Fatal(err)
	}
	search = call("search_logs", map[string]any{"query": "100%", "cursor": searchResult.StructuredContent.NextCursor}, false)
	requireContains(search, "100% FAILURE", "100% retry failure")
	forbid(search, "100% job failure")
	requireContains(call("search_logs", map[string]any{"query": "100%", "since": "2020-01-01T00:00:00Z"}, true), "30 days")
	var auditRows int
	if err := a.Store.Pool.QueryRow(ctx, `SELECT count(*) FROM audit WHERE user_id=$1 AND action='mcp.search_logs'
		AND detail=jsonb_build_object('tokenId',$2::text)`, "mcp:"+issued.Token.ID, issued.Token.ID).Scan(&auditRows); err != nil || auditRows != 4 {
		t.Fatalf("expected four MCP search audits without the search text, got %d: %v", auditRows, err)
	}
	exec("UPDATE resources SET parent_id=$1 WHERE id=$2", foreignEnv, app)
	requireContains(call("read_deployment_logs", map[string]any{"deploymentId": deployment}, true), "Resource not found")
	forbid(call("search_logs", map[string]any{"query": "retry failure"}, false), "100% retry failure")

	path := settings + "/" + issued.Token.ID
	access := func(projectID string) string {
		return `{"projectIds":["` + projectID + `"]}`
	}
	for _, mutation := range []struct{ method, path, body string }{
		{"PATCH", path, access(foreign)},
		{"POST", path + "/recreate", `{}`},
		{"DELETE", path + "/record", ""},
	} {
		status, body = request(tls, mutation.method, mutation.path, mutation.body, "", "viewer-cookie", "csrf", "")
		check(status, 404, body)
		status, body = request(tls, mutation.method, mutation.path, mutation.body, "", "admin-cookie", "", "")
		check(status, 403, body)
	}
	status, body = request(tls, "PATCH", path, access(uuid.NewString()), "", "admin-cookie", "csrf", "")
	check(status, 400, body)
	apps = call("list_applications", map[string]any{}, false)
	requireContains(apps, job)
	forbid(apps, other)
	status, body = request(tls, "PATCH", path, access(foreign), "", "admin-cookie", "csrf", "")
	check(status, 200, body)
	apps = call("list_applications", map[string]any{}, false)
	requireContains(apps, other, app)
	forbid(apps, job)
	tokens, err := a.Store.MCPTokens(ctx, admin)
	if err != nil || len(tokens) != 1 || !tokens[0].ExpiresAt.Equal(issued.Token.ExpiresAt) {
		t.Fatalf("access update changed the original expiry: %+v %v", tokens, err)
	}

	recreate := func(payload string, lifetime time.Duration) mcpIssuedToken {
		t.Helper()
		before := time.Now()
		status, body := request(tls, "POST", path+"/recreate", payload, "", "admin-cookie", "csrf", "")
		check(status, 200, body)
		var next mcpIssuedToken
		if err := json.Unmarshal([]byte(body), &next); err != nil {
			t.Fatal(err)
		}
		if next.Token.ID != issued.Token.ID || next.Token.Name != issued.Token.Name || !next.Token.CreatedAt.Equal(issued.Token.CreatedAt) ||
			!slices.Equal(next.Token.ProjectIDs, []string{foreign}) || next.Token.RevokedAt != nil || next.Secret == "" || next.Secret == issued.Secret {
			t.Fatal("recreation did not preserve the token record and replace its secret")
		}
		if delta := next.Token.ExpiresAt.Sub(before); delta < lifetime-time.Second || delta > lifetime+time.Minute {
			t.Fatalf("unexpected recreated lifetime: %s", delta)
		}
		return next
	}
	rotated := recreate(`{"expiryDays":14}`, 14*24*time.Hour)
	status, body = request(tls, "POST", "/mcp", discovery, issued.Secret, "", "", "")
	check(status, 401, body)
	for _, probe := range []struct {
		secret string
		count  int
	}{{issued.Secret, 0}, {rotated.Secret, 2}} {
		apps, err := a.Store.MCPApplications(ctx, secure.Hash(probe.secret), db.MCPApplicationFilter{Limit: 20})
		if err != nil || len(apps) != probe.count {
			t.Fatalf("expected %d applications for the credential, got %d: %v", probe.count, len(apps), err)
		}
	}
	issued = rotated
	exec("UPDATE settings SET value='true' WHERE key='maintenance'")
	status, body = request(tls, "DELETE", path, "", "", "admin-cookie", "csrf", "")
	check(status, 200, body)
	status, body = request(tls, "POST", "/mcp", discovery, issued.Secret, "", "", "")
	check(status, 401, body)
	exec("UPDATE settings SET value='false' WHERE key='maintenance'")
	issued = recreate(`{}`, 30*24*time.Hour)
	exec("UPDATE mcp_tokens SET expires_at=now()-interval '1 second' WHERE id=$1", issued.Token.ID)
	status, body = request(tls, "POST", "/mcp", discovery, issued.Secret, "", "", "")
	check(status, 401, body)
	status, body = request(tls, "GET", settings, "", "", "admin-cookie", "", "")
	check(status, 200, body)
	requireContains(body, issued.Token.ID)
	forbid(body, issued.Secret, secure.Hash(issued.Secret))
	issued = recreate(`{"expiryDays":1}`, 24*time.Hour)
	if id, err := a.Store.MCPTokenID(ctx, secure.Hash(issued.Secret)); err != nil || id != issued.Token.ID {
		t.Fatalf("expired token was not reactivated: %v", err)
	}
	status, body = request(tls, "DELETE", path+"/record", "", "", "admin-cookie", "csrf", "")
	check(status, 200, body)
	status, body = request(tls, "POST", "/mcp", discovery, issued.Secret, "", "", "")
	check(status, 401, body)
	status, body = request(tls, "GET", settings, "", "", "admin-cookie", "", "")
	check(status, 200, body)
	forbid(body, issued.Token.ID)
	status, body = request(tls, "POST", path+"/recreate", `{}`, "", "admin-cookie", "csrf", "")
	check(status, 404, body)
	if err := a.Store.Pool.QueryRow(ctx, `SELECT count(*) FROM audit WHERE user_id=$1 AND resource_id=$2
		AND action IN ('mcp.token_access_updated','mcp.token_recreated','mcp.token_deleted')`, admin, issued.Token.ID).Scan(&auditRows); err != nil || auditRows != 5 {
		t.Fatalf("expected five successful management actions in audit history, got %d: %v", auditRows, err)
	}

	exec("UPDATE resources SET parent_id=$1 WHERE id=$2", env, app)
	exec("INSERT INTO project_members(project_id,user_id,role) VALUES($1,$3,'viewer'),($2,$3,'operator')", project, project2, viewer)
	issue := func(cookie string, projectIDs ...string) mcpIssuedToken {
		t.Helper()
		payload, _ := json.Marshal(map[string]any{"name": "Owned token", "projectIds": projectIDs})
		status, body := request(tls, "POST", settings, string(payload), "", cookie, "csrf", "")
		check(status, 201, body)
		var credential mcpIssuedToken
		if err := json.Unmarshal([]byte(body), &credential); err != nil {
			t.Fatal(err)
		}
		return credential
	}
	adminToken := issue("admin-cookie", foreign)
	memberToken := issue("viewer-cookie", project, project2)
	if memberToken.Token.OwnerID == nil || *memberToken.Token.OwnerID != viewer {
		t.Fatal("issued token does not belong to the signed-in user")
	}
	memberPath := settings + "/" + memberToken.Token.ID
	status, body = request(tls, "GET", settings, "", "", "viewer-cookie", "", "")
	check(status, 200, body)
	requireContains(body, memberToken.Token.ID, project, project2)
	forbid(body, adminToken.Token.ID, foreign, memberToken.Secret, secure.Hash(memberToken.Secret))
	status, body = request(tls, "GET", settings, "", "", "admin-cookie", "", "")
	check(status, 200, body)
	requireContains(body, adminToken.Token.ID, memberToken.Token.ID, "Viewer")
	forbid(body, memberToken.Secret, secure.Hash(memberToken.Secret))
	for _, mutation := range []struct{ method, path, body string }{
		{"PATCH", memberPath, access(foreign)},
		{"POST", memberPath + "/recreate", `{}`},
	} {
		status, body = request(tls, mutation.method, mutation.path, mutation.body, "", "admin-cookie", "csrf", "")
		check(status, 404, body)
	}
	status, body = request(tls, "DELETE", settings+"/"+adminToken.Token.ID, "", "", "viewer-cookie", "csrf", "")
	check(status, 404, body)
	status, body = request(tls, "PATCH", memberPath, access(foreign), "", "viewer-cookie", "csrf", "")
	check(status, 400, body)

	memberCall := func(name string, args map[string]any) string {
		t.Helper()
		payload, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tools/call",
			"params": map[string]any{"name": name, "arguments": args}})
		status, body := request(tls, "POST", "/mcp", string(payload), memberToken.Secret, "", "", "")
		check(status, 200, body)
		return body
	}
	requireContains(memberCall("list_applications", map[string]any{}), app, job)
	forbid(memberCall("list_applications", map[string]any{"projectId": foreign}), other)
	forbid(memberCall("search_logs", map[string]any{"query": "100%"}), "100% hidden failure")
	removeRuntimeAccess.Store(true)
	deniedRuntime := memberCall("read_runtime_logs", map[string]any{"applicationId": app})
	requireContains(deniedRuntime, "Resource not found")
	forbid(deniedRuntime, "password=")
	removeRuntimeAccess.Store(false)
	forbid(memberCall("list_applications", map[string]any{}), app)
	exec("DELETE FROM project_members WHERE user_id=$1 AND project_id=$2", viewer, project2)
	status, body = request(tls, "POST", "/mcp", discovery, memberToken.Secret, "", "", "")
	check(status, 401, body)
	status, body = request(tls, "POST", memberPath+"/recreate", `{}`, "", "viewer-cookie", "csrf", "")
	check(status, 409, body)

	exec("INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,'owner')", team, viewer)
	requireContains(memberCall("list_applications", map[string]any{}), app, job)
	forbid(memberCall("list_applications", map[string]any{}), other)
	exec("UPDATE users SET admin=false WHERE id=$1", admin)
	status, body = request(tls, "POST", "/mcp", discovery, adminToken.Secret, "", "", "")
	check(status, 401, body)
	exec("UPDATE users SET admin=true WHERE id=$1", admin)
	exec("UPDATE users SET disabled=true WHERE id=$1", viewer)
	status, body = request(tls, "POST", "/mcp", discovery, memberToken.Secret, "", "", "")
	check(status, 401, body)
	exec("UPDATE users SET disabled=false WHERE id=$1", viewer)
	requireContains(memberCall("list_applications", map[string]any{}), app)
	status, body = request(tls, "DELETE", memberPath, "", "", "admin-cookie", "csrf", "")
	check(status, 200, body)
	status, body = request(tls, "POST", "/mcp", discovery, memberToken.Secret, "", "", "")
	check(status, 401, body)
	status, body = request(tls, "DELETE", memberPath+"/record", "", "", "admin-cookie", "csrf", "")
	check(status, 200, body)
	memberToken = issue("viewer-cookie", project)
	exec("DELETE FROM users WHERE id=$1", viewer)
	status, body = request(tls, "POST", "/mcp", discovery, memberToken.Secret, "", "", "")
	check(status, 401, body)
	status, body = request(tls, "GET", settings, "", "", "admin-cookie", "", "")
	check(status, 200, body)
	forbid(body, memberToken.Token.ID)
}

func TestMCPManagedDashboardProxyTLSBoundary(t *testing.T) {
	a, _ := testAPI(t)
	a.Control.Local = remote.NewDocker("/unused-test-socket", "executor")
	ctx := t.Context()
	if _, err := a.Store.Pool.Exec(ctx, `INSERT INTO settings(key,value) VALUES
		('dashboard-access','{"activeDomain":"shipyard.test","version":0}')`); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Store.Save(ctx, control.DashboardID, model.ResourceInput{
		Kind: "system", Name: "Dashboard", Data: json.RawMessage(`{"gateway":"172.20.0.1"}`),
	}); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		peer, host, protocol, want string
	}{
		{"172.20.0.1:1000", "shipyard.test", "https", "https://shipyard.test"},
		{"172.20.0.2:1000", "shipyard.test", "https", ""},
		{"172.20.0.1:1000", "shipyard.test", "http", ""},
		{"172.20.0.1:1000", "foreign.test", "https", ""},
	} {
		request := httptest.NewRequestWithContext(ctx, http.MethodPost, "http://"+test.host+"/mcp", nil)
		request.RemoteAddr = test.peer
		request.Header.Set("X-Forwarded-Proto", test.protocol)
		if got := a.dashboardProxyOrigin(request); got != test.want {
			t.Fatalf("unexpected HTTPS origin for %+v: %q", test, got)
		}
	}
}

func TestMCPRequiresBearerBeforeProtocol(t *testing.T) {
	a := &API{Origin: "https://shipyard.test"}
	h := a.Router()
	for _, body := range []string{
		`{"jsonrpc":"2.0","id":1,"method":"initialize"}`,
		`{"jsonrpc":"2.0","id":1,"method":"server/discover"}`,
		`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`,
	} {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "https://shipyard.test/mcp", strings.NewReader(body))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized || w.Header().Get("WWW-Authenticate") == "" || strings.Contains(w.Body.String(), "list_applications") {
			t.Fatalf("unexpected protected response: %d %s", w.Code, w.Body.String())
		}
	}
}
