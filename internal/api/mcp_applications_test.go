package api

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/secure"
)

func TestMCPApplicationManagement(t *testing.T) {
	a, _ := testAPI(t)
	ctx := t.Context()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := a.Store.Pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	save := func(kind, name, team, parent string) string {
		t.Helper()
		r, err := a.Store.Save(ctx, "", model.ResourceInput{Kind: kind, Name: name, TeamID: team, ParentID: parent, Data: json.RawMessage("{}")})
		if err != nil {
			t.Fatal(err)
		}
		return r.ID
	}
	team := save("team", "Team", "", "")
	project := save("project", "Project", team, team)
	env := save("environment", "Production", team, project)
	host := save("server", "Host", "", "")
	exec("INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", host, team)
	owner := uuid.NewString()
	exec("INSERT INTO users(id,email,name,password) VALUES($1,'operator@mcp.test','Operator','disabled')", owner)
	exec("INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'operator')", project, owner)
	issue := func(grants ...string) (context.Context, string) {
		t.Helper()
		permissions := db.MCPProjectPermissions{}
		if len(grants) > 0 {
			permissions[project] = grants
		}
		token, secret, err := a.Store.IssueMCPTokenWithPermissions(ctx, owner, "E2E", []string{project}, permissions, 30)
		if err != nil {
			t.Fatal(err)
		}
		hash := secure.Hash(secret)
		return context.WithValue(ctx, mcpTokenContextKey{}, mcpCredential{id: token.ID, hash: hash}), hash
	}
	readCtx, readHash := issue()
	configCtx, configHash := issue(db.MCPConfigure)
	lifeCtx, lifeHash := issue(db.MCPLifecycle)
	freshCtx, freshHash := issue(db.MCPFreshDeploy)
	cleanCtx, cleanHash := issue(db.MCPCleanup)

	input := mcpCreateAppInput{EnvironmentID: env, RequestID: uuid.NewString(), Name: "Test app",
		Data:    map[string]any{"serverId": host, "source": "compose", "engine": "compose"},
		Secrets: map[string]string{"compose": "services:\n  web:\n    image: busybox:1.37.0\n", "env:PRIVATE": "secret-value"}}
	if _, err := a.mcpCreateApp(readCtx, readHash, input); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("read-only token created an app: %v", err)
	}
	created, err := a.mcpCreateApp(configCtx, configHash, input)
	if err != nil || created.ApplicationID == "" {
		t.Fatalf("unable to create application: %+v %v", created, err)
	}
	again, err := a.mcpCreateApp(configCtx, configHash, input)
	if err != nil || again.ApplicationID != created.ApplicationID {
		t.Fatalf("creation retry did not reuse the application: %+v %v", again, err)
	}
	app := created.ApplicationID
	info, err := a.mcpAppDetails(readCtx, readHash, mcpAppDetailsInput{ApplicationID: app})
	raw, _ := json.Marshal(info)
	if err != nil || strings.Contains(string(raw), "secret-value") || strings.Contains(string(raw), "busybox") {
		t.Fatalf("read returned encrypted material or failed: %v", err)
	}
	edit := mcpAppSettingsInput{ApplicationID: app, Section: "application", Version: created.Version, Settings: map[string]any{"name": "Renamed"}}
	updated, err := a.mcpAppSettings(configCtx, configHash, edit)
	if err != nil || updated.Version <= created.Version {
		t.Fatalf("configuration edit failed: %+v %v", updated, err)
	}
	if _, err = a.mcpAppSettings(configCtx, configHash, edit); err == nil {
		t.Fatal("stale edit succeeded")
	}
	if _, err := a.mcpAppDetails(configCtx, configHash, mcpAppDetailsInput{ApplicationID: app, Section: "publishedPorts"}); err == nil {
		t.Fatal("an operator accessed a platform-admin settings section")
	}

	deploy := mcpDeployAppInput{ApplicationID: app, RequestID: uuid.NewString()}
	if _, err := a.mcpDeployApp(configCtx, configHash, deploy); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("configuration grant admitted a deployment: %v", err)
	}
	d, err := a.mcpDeployApp(lifeCtx, lifeHash, deploy)
	if err != nil || d.DeploymentID == "" {
		t.Fatalf("lifecycle deployment failed: %+v %v", d, err)
	}
	duplicate, err := a.mcpDeployApp(lifeCtx, lifeHash, deploy)
	if err != nil || duplicate.DeploymentID != d.DeploymentID {
		t.Fatalf("retry submitted a different deployment: %+v %v", duplicate, err)
	}
	fresh := mcpFreshAppInput{ApplicationID: app, RequestID: uuid.NewString(), Version: updated.Version, ConfirmName: "Renamed"}
	if _, err := a.mcpFreshApp(lifeCtx, lifeHash, fresh); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("lifecycle grant admitted Fresh deploy: %v", err)
	}
	fresh.ConfirmName = "Wrong name"
	if _, err := a.mcpFreshApp(freshCtx, freshHash, fresh); err == nil {
		t.Fatal("Fresh deploy accepted an incorrect name")
	}
	if _, err := a.mcpCleanupApp(cleanCtx, cleanHash, mcpCleanupAppInput{ApplicationID: app, Target: "deployment", ResourceID: d.DeploymentID}); err == nil {
		t.Fatal("cleanup deleted an in-progress deployment")
	}
	exec("UPDATE project_members SET role='viewer' WHERE project_id=$1 AND user_id=$2", project, owner)
	if _, err := a.mcpDeployApp(lifeCtx, lifeHash, mcpDeployAppInput{ApplicationID: app, RequestID: uuid.NewString()}); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("demoted owner retained lifecycle access: %v", err)
	}
}
