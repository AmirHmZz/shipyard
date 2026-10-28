package control

import (
	"context"
	"encoding/json"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"strings"
	"testing"
)

func TestDirectComposeQueueSnapshotsWithoutGit(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	server := resource(t, c, "server", "", "", model.Server{}, nil)
	_, _ = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", server.ID, team.ID)
	source := "services:\n  web:\n    image: nginx:alpine\n    environment:\n      PASSWORD: private-value\n"
	app := resource(t, c, "application", "", team.ID, model.App{Source: "compose", Engine: "compose", ServerID: server.ID, Context: ".", File: "compose.yaml"}, map[string]string{"compose": source})
	d, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	var encrypted []byte
	if err = c.Store.Pool.QueryRow(ctx, "SELECT snapshot FROM deployments WHERE id=$1", d.ID).Scan(&encrypted); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encrypted), "private-value") {
		t.Fatal("snapshot not encrypted")
	}
	plain, err := c.Store.Vault.Open(encrypted, "deployment:"+d.ID)
	if err != nil {
		t.Fatal(err)
	}
	var snapshot DeploymentSnapshot
	if json.Unmarshal(plain, &snapshot) != nil || snapshot.ComposeSource != source {
		t.Fatal("source snapshot missing")
	}
	spec, _ := model.Decode[model.App](app)
	if _, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: "application", Name: app.Name, Data: app.Data, Version: app.Version, Secrets: map[string]string{"compose": "services:\n  changed:\n    image: busybox\n"}}); err != nil {
		t.Fatal(err)
	}
	if snapshot.ComposeSource != source || spec.GitID != "" {
		t.Fatal("mutable source or Git dependency")
	}
	if _, err = c.Queue(ctx, app, "main", ""); err == nil {
		t.Fatal("Git ref accepted for Direct Compose")
	}
	_, _ = c.Store.Pool.Exec(ctx, "DELETE FROM resource_grants WHERE resource_id=$1", server.ID)
	if _, err = c.Queue(ctx, app, "", ""); err == nil {
		t.Fatal("server grant not enforced")
	}
}

func TestGitInlinePreviewCopiesEncryptedDocumentSnapshot(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	project := resource(t, c, "project", team.ID, team.ID, map[string]any{}, nil)
	environment := resource(t, c, "environment", project.ID, team.ID, map[string]any{}, nil)
	host := resource(t, c, "server", "", "", model.Server{}, nil)
	git := resource(t, c, "git", "", "", model.Git{}, nil)
	for _, id := range []string{host.ID, git.ID} {
		if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", id, team.ID); err != nil {
			t.Fatal(err)
		}
	}
	spec := model.App{Source: "git", Engine: "compose", ComposeMode: "inline", ServerID: host.ID, GitID: git.ID, Repository: "owner/app", Branch: "main", Context: ".", Previews: true, PreviewRouting: &model.PreviewRouting{Mode: "private"}, ReadinessMode: "container"}
	yaml := "services:\n  web:\n    build: .\n    environment:\n      PASSWORD: private-compose-value\n"
	app := resource(t, c, "application", environment.ID, team.ID, spec, map[string]string{"compose": yaml})
	sha := strings.Repeat("a", 40)
	if err := c.preview(ctx, app, spec, providers.GitEvent{Action: "opened", PR: 1, HeadRepo: "owner/app", HeadBranch: "feature", HeadSHA: sha}, false); err != nil {
		t.Fatal(err)
	}
	apps, err := c.Store.Resources(ctx, "application")
	if err != nil {
		t.Fatal(err)
	}
	var preview model.Resource
	for _, candidate := range apps {
		a, _ := model.Decode[model.App](candidate)
		if a.PreviewOf == app.ID {
			preview = candidate
		}
	}
	if preview.ID == "" {
		t.Fatal("preview not created")
	}
	secrets, err := c.Store.Secrets(preview)
	if err != nil || secrets["compose"] != yaml || strings.Contains(string(preview.Secret), "private-compose-value") {
		t.Fatal("preview document missing or unencrypted", err)
	}
	var encrypted []byte
	if err = c.Store.Pool.QueryRow(ctx, "SELECT snapshot FROM deployments WHERE app_id=$1", preview.ID).Scan(&encrypted); err != nil {
		t.Fatal(err)
	}
	var deploymentID string
	if err = c.Store.Pool.QueryRow(ctx, "SELECT id FROM deployments WHERE app_id=$1", preview.ID).Scan(&deploymentID); err != nil {
		t.Fatal(err)
	}
	plain, err := c.Store.Vault.Open(encrypted, "deployment:"+deploymentID)
	var snapshot DeploymentSnapshot
	if err != nil || json.Unmarshal(plain, &snapshot) != nil || snapshot.ComposeSource != yaml || snapshot.Ref != sha {
		t.Fatal("preview did not snapshot source and approved Git commit", err)
	}
}
