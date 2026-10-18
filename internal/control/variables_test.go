package control

import (
	"context"
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"

	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/remote"
)

func setVariables(t *testing.T, c *Controller, r model.Resource, values map[string]*string, secrets map[string]string) model.Resource {
	t.Helper()
	updated, err := c.Store.Save(context.Background(), r.ID, model.ResourceInput{Kind: r.Kind, Name: r.Name, Data: r.Data, Version: r.Version, Variables: values, Secrets: secrets})
	if err != nil {
		t.Fatal(err)
	}
	return updated
}

type variableServiceNode struct {
	deletionNode
	environment string
}

func (n *variableServiceNode) Run(ctx context.Context, command string, input io.Reader, output io.Writer) error {
	if strings.HasPrefix(command, "umask 077; cat > ") && strings.Contains(command, "inspect.env") {
		value, err := io.ReadAll(input)
		n.environment = string(value)
		return err
	}
	if strings.Contains(command, remote.Command("config", "--format", "json")) {
		_, err := io.WriteString(output, `{"services":{"web":{"deploy":{"replicas":2}}}}`)
		return err
	}
	if input != nil {
		_, err := io.Copy(io.Discard, input)
		return err
	}
	return nil
}

func (n *variableServiceNode) RunSeparated(ctx context.Context, command string, input io.Reader, output, stderr io.Writer) error {
	return n.Run(ctx, command, input, output)
}

func TestServiceDiscoveryOrdinaryVariablesAndPreviewIsolation(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	node := &variableServiceNode{}
	c.DialNode = func(context.Context, model.Server, map[string]string) (remote.Node, error) { return node, nil }
	project := resource(t, c, "project", "", "", map[string]any{}, map[string]string{"env:SECRET": "production-secret", "preview-env:SECRET": "preview-secret"})
	production, preview, child := "production-value", "preview-value", "child-value"
	project = setVariables(t, c, project, map[string]*string{"env:PLAIN": &production, "preview-env:PLAIN": &preview, "env:OVERRIDE": &production, "preview-env:OVERRIDE": &preview}, nil)
	server := resource(t, c, "server", "", "", model.Server{}, nil)
	for _, isPreview := range []bool{false, true} {
		spec := model.App{Source: "compose", Engine: "compose", ServerID: server.ID, Context: ".", File: "compose.yaml"}
		if isPreview {
			spec.PreviewOf = "source"
		}
		app := resource(t, c, "application", project.ID, "", spec, map[string]string{"compose": "services:\n  web:\n    image: nginx:alpine\n"})
		app = setVariables(t, c, app, map[string]*string{"env:OVERRIDE": &child}, nil)
		services, err := c.Services(ctx, app)
		if err != nil || len(services) != 1 || services[0].Replicas != 2 {
			t.Fatal("service discovery failed", services, err)
		}
		if !strings.Contains(node.environment, "OVERRIDE='child-value'") {
			t.Fatal("application override missing", node.environment)
		}
		if isPreview {
			if !strings.Contains(node.environment, "PLAIN='preview-value'") || !strings.Contains(node.environment, "SECRET='preview-secret'") || strings.Contains(node.environment, "production-") {
				t.Fatal("preview service discovery leaked production values", node.environment)
			}
		} else if !strings.Contains(node.environment, "PLAIN='production-value'") || !strings.Contains(node.environment, "SECRET='production-secret'") {
			t.Fatal("ordinary service discovery values missing", node.environment)
		}
	}
}

func TestOrdinaryVariableInheritanceAndPreviewReconciliation(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	project := resource(t, c, "project", team.ID, team.ID, map[string]any{}, map[string]string{"env:OVERRIDE": "parent-secret", "env:PRODUCTION": "production-secret"})
	environment := resource(t, c, "environment", project.ID, team.ID, map[string]any{}, nil)
	parent, previewParent, child, previewChild := "parent-value", "parent-preview", "child-value", "child-preview"
	project = setVariables(t, c, project, map[string]*string{"env:PLAIN": &parent, "preview-env:PLAIN": &previewParent}, nil)
	dns := resource(t, c, "dns", "", "", model.DNS{Provider: "cloudflare"}, nil)
	zone := resource(t, c, "zone", dns.ID, "", model.Zone{Domain: "example.com", ProviderZoneID: "zone"}, nil)
	server := resource(t, c, "server", "", "", model.Server{}, nil)
	git := resource(t, c, "git", "", "", model.Git{Provider: "gitea", URL: "https://git.invalid"}, nil)
	for _, id := range []string{server.ID, git.ID, zone.ID} {
		if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", id, team.ID); err != nil {
			t.Fatal(err)
		}
	}
	spec := model.App{Engine: "dockerfile", ServerID: server.ID, GitID: git.ID, Repository: "owner/repo", Branch: "main", Context: ".", File: "Dockerfile", Port: 8080, Previews: true, PreviewDomain: "*.preview.example.com", PreviewZoneID: zone.ID}
	app := resource(t, c, "application", environment.ID, team.ID, spec, map[string]string{"preview-env:SWAP": "preview-secret"})
	app = setVariables(t, c, app, map[string]*string{"env:OVERRIDE": &child, "preview-env:LOCAL": &previewChild}, nil)
	deployment, err := c.Queue(ctx, app, "main", "")
	if err != nil {
		t.Fatal(err)
	}
	var encrypted []byte
	if err := c.Store.Pool.QueryRow(ctx, "SELECT snapshot FROM deployments WHERE id=$1", deployment.ID).Scan(&encrypted); err != nil {
		t.Fatal(err)
	}
	raw, err := c.Store.Vault.Open(encrypted, "deployment:"+deployment.ID)
	if err != nil {
		t.Fatal(err)
	}
	var snapshot DeploymentSnapshot
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.Env["PLAIN"] != parent || snapshot.Env["OVERRIDE"] != child {
		t.Fatal("ordinary inheritance failed", snapshot.Env)
	}
	event := providers.GitEvent{PR: 1, Action: "opened", Repository: "owner/repo", HeadRepo: "fork/repo", HeadBranch: "change", HeadSHA: strings.Repeat("a", 40), Fork: true, UpdatedAt: time.Now().UTC()}
	if err := c.preview(ctx, app, spec, event, false); err != nil {
		t.Fatal(err)
	}
	var id string
	if err := c.Store.Pool.QueryRow(ctx, "SELECT id FROM resources WHERE data->>'previewOf'=$1", app.ID).Scan(&id); err != nil {
		t.Fatal(err)
	}
	preview, err := c.Store.Resource(ctx, id)
	if err != nil || preview.Variables["env:LOCAL"] != previewChild {
		t.Fatal("preview ordinary value missing", err)
	}
	// Change secret to ordinary and remove an ordinary value; synchronize must
	// remove stale values without exposing the former secret.
	app = setVariables(t, c, app, map[string]*string{"preview-env:LOCAL": nil, "preview-env:SWAP": &child}, nil)
	event.Action = "synchronize"
	event.UpdatedAt = event.UpdatedAt.Add(time.Second)
	if err := c.preview(ctx, app, spec, event, false); err != nil {
		t.Fatal(err)
	}
	preview, err = c.Store.Resource(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	secrets, err := c.Store.Secrets(preview)
	if err != nil || secrets["env:SWAP"] != "" || preview.Variables["env:SWAP"] != child {
		t.Fatal("preview secret-to-ordinary conversion failed", err)
	}
	if _, ok := preview.Variables["env:LOCAL"]; ok {
		t.Fatal("stale ordinary preview value retained")
	}
	app = setVariables(t, c, app, nil, map[string]string{"preview-env:SWAP": "replacement-secret"})
	event.UpdatedAt = event.UpdatedAt.Add(time.Second)
	if err := c.preview(ctx, app, spec, event, false); err != nil {
		t.Fatal(err)
	}
	preview, _ = c.Store.Resource(ctx, id)
	secrets, _ = c.Store.Secrets(preview)
	if _, ok := preview.Variables["env:SWAP"]; ok || secrets["env:SWAP"] != "replacement-secret" {
		t.Fatal("preview ordinary-to-secret conversion failed")
	}
	if err := c.ApprovePreview(ctx, id, event.HeadSHA); err != nil {
		t.Fatal(err)
	}
	var deploymentID string
	if err := c.Store.Pool.QueryRow(ctx, "SELECT id,snapshot FROM deployments WHERE app_id=$1 ORDER BY created_at DESC LIMIT 1", id).Scan(&deploymentID, &encrypted); err != nil {
		t.Fatal(err)
	}
	raw, err = c.Store.Vault.Open(encrypted, "deployment:"+deploymentID)
	if err != nil {
		t.Fatal(err)
	}
	// Decode into a fresh snapshot: JSON maps otherwise retain missing keys.
	var previewSnapshot DeploymentSnapshot
	if err := json.Unmarshal(raw, &previewSnapshot); err != nil {
		t.Fatal(err)
	}
	if previewSnapshot.Env["PLAIN"] != previewParent || previewSnapshot.Env["PRODUCTION"] != "" || previewSnapshot.Env["OVERRIDE"] != "" || previewSnapshot.Env["SWAP"] != "replacement-secret" {
		t.Fatal("preview inheritance leaked production variables", previewSnapshot.Env)
	}
}
