package control

import (
	"context"
	"encoding/json"
	"shipyard/internal/model"
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
