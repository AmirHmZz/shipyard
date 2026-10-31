package control

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/remote"
)

func TestLinuxGitInlineComposeRenameCleanup(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires isolated SSH/Docker fixture")
	}
	c := testController(t)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()
	host := os.Getenv("SHIPYARD_FIXTURE_HOST")
	key, err := os.ReadFile(os.Getenv("SHIPYARD_FIXTURE_PRIVATE_KEY_FILE"))
	if err != nil {
		t.Fatal(err)
	}
	fingerprint, err := remote.Fingerprint(ctx, host, 2222)
	if err != nil {
		t.Fatal(err)
	}
	server := resource(t, c, "server", "", "", model.Server{Host: host, Port: 2222, User: "root", Fingerprint: fingerprint}, map[string]string{"private_key": string(key)})
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	git := resource(t, c, "git", "", "", model.Git{Provider: "gitea", URL: "https://git.example.test"}, nil)
	for _, id := range []string{server.ID, git.ID} {
		if _, err = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", id, team.ID); err != nil {
			t.Fatal(err)
		}
	}
	binaryPath := filepath.Join(t.TempDir(), "backend")
	cmd := exec.CommandContext(ctx, "go", "build", "-buildvcs=false", "-o", binaryPath, "../../tests/fixture")
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatal(err, string(out))
	}
	binary, err := os.ReadFile(binaryPath)
	if err != nil {
		t.Fatal(err)
	}
	c.GitFactory = func(model.Git, map[string]string) providers.GitProvider {
		return &localGit{binary: binary, version: "inline", compose: true}
	}
	source := "services:\n  old:\n    build:\n      context: .\n      dockerfile: Dockerfile\n"
	spec := model.App{Source: "git", ComposeMode: "inline", Engine: "compose", ServerID: server.ID, GitID: git.ID, Repository: "owner/app", Branch: "main", Context: ".", File: "compose.yaml", ReadinessMode: "container", HealthTimeout: 20, Networking: map[string]model.ServiceNetworking{"old": {Hostname: "old"}}}
	app := resource(t, c, "application", "", team.ID, spec, map[string]string{"compose": source})
	catalog, err := c.Services(ctx, app)
	if err != nil || len(catalog) != 1 || catalog[0].Name != "old" {
		t.Fatal("service discovery did not use saved inline Compose", catalog, err)
	}
	route := resource(t, c, "route", app.ID, team.ID, model.Route{Protocol: "tcp", TLS: "passthrough", Service: "old", ListenPort: 19090, TargetPort: 8080}, nil)
	run := func(rollback string) (model.Deployment, error) {
		d, err := c.Queue(ctx, app, "", rollback)
		if err == nil {
			err = c.deploy(ctx, d.ID)
		}
		if err != nil {
			return d, err
		}
		return c.Store.Deployment(ctx, d.ID)
	}
	first, err := run("")
	if err != nil {
		t.Fatal("Git inline build", err)
	}
	active, err := c.Store.Active(ctx, app.ID)
	if err != nil || active.Images["old"] == "" || !model.ValidSHA(active.Commit) {
		t.Fatal("inline source or Git identity lost", active, err)
	}
	node, _, err := c.connect(ctx, server.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer node.Close()
	repositoryYAML, err := deploy.Output(ctx, node, "cat", active.Directory+"/source/compose.yaml")
	if err != nil || !strings.Contains(repositoryYAML, "  web:") || strings.Contains(repositoryYAML, "  old:") {
		t.Fatal("repository compose file overwritten", repositoryYAML, err)
	}
	save := func(yaml string) {
		t.Helper()
		app, err = c.Store.Resource(ctx, app.ID)
		if err == nil {
			app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: app.Data, Version: app.Version, Secrets: map[string]string{"compose": yaml}})
		}
		if err != nil {
			t.Fatal(err)
		}
	}
	renamed := strings.Replace(source, "  old:", "  new:", 1)
	save(strings.Replace(renamed, "dockerfile: Dockerfile", "dockerfile: missing.Dockerfile", 1))
	if _, err = run(""); err == nil {
		t.Fatal("missing Dockerfile build succeeded")
	}
	if _, err = c.Store.Resource(ctx, route.ID); err == nil {
		t.Fatal("stale domain retained after failed image build")
	}
	saved, _ := c.Store.Resource(ctx, app.ID)
	current, _ := model.Decode[model.App](saved)
	if len(current.Networking) != 0 {
		t.Fatal("stale networking retained")
	}
	stillActive, err := c.Store.Active(ctx, app.ID)
	if err != nil || stillActive.ID != active.ID {
		t.Fatal("build failure changed active release", err)
	}
	save(renamed)
	if _, err = run(""); err != nil {
		t.Fatal("renamed service did not deploy", err)
	}
	if _, err = run(first.ReleaseID); err != nil {
		t.Fatal("rollback", err)
	}
	recovered, err := c.Store.Active(ctx, app.ID)
	if err != nil || len(recovered.Routes) != 0 || len(recovered.App.Networking) != 0 {
		t.Fatal("rollback resurrected removed settings", err)
	}
	routes, _ := c.Store.Children(ctx, app.ID, "route")
	if len(routes) != 0 {
		t.Fatal("deleted route recreated")
	}
}
