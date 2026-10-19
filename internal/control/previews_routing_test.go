package control

import (
	"context"
	"encoding/json"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"strings"
	"testing"
	"time"
)

func TestExplicitPreviewRoutingUpdatesExistingPreviews(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	project := resource(t, c, "project", team.ID, team.ID, map[string]any{}, nil)
	environment := resource(t, c, "environment", project.ID, team.ID, map[string]any{}, nil)
	server := resource(t, c, "server", "", "", model.Server{}, nil)
	git := resource(t, c, "git", "", "", model.Git{Provider: "gitea", URL: "https://git.invalid"}, nil)
	dns := resource(t, c, "dns", "", "", model.DNS{Provider: "cloudflare"}, nil)
	zone := resource(t, c, "zone", dns.ID, "", model.Zone{Domain: "example.com", ProviderZoneID: "zone"}, nil)
	for _, id := range []string{server.ID, git.ID, zone.ID} {
		if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", id, team.ID); err != nil {
			t.Fatal(err)
		}
	}
	spec := model.App{Source: "git", Engine: "dockerfile", ServerID: server.ID, GitID: git.ID, Repository: "owner/repo", Branch: "main", Context: ".", File: "Dockerfile", Previews: true, ReadinessChecks: []model.HTTPReadinessCheck{}, PreviewRouting: &model.PreviewRouting{Mode: "private"}}
	app := resource(t, c, "application", environment.ID, team.ID, spec, nil)
	var previewID string
	for index, mode := range []string{"private", "target", "target", "private"} {
		spec.PreviewRouting = &model.PreviewRouting{Mode: mode}
		if mode == "target" {
			spec.PreviewRouting.Service = "app"
			spec.PreviewRouting.Port = 8000 + index
			spec.PreviewDomain = "*.preview.example.com"
			spec.PreviewZoneID = zone.ID
		}
		raw, _ := json.Marshal(spec)
		var err error
		app, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Version: app.Version, Data: raw})
		if err != nil {
			t.Fatal(err)
		}
		event := providers.GitEvent{PR: 7, Action: "synchronize", Repository: "owner/repo", HeadRepo: "owner/repo", HeadBranch: "change", HeadSHA: strings.Repeat(string(rune('a'+index)), 40), UpdatedAt: time.Now().Add(time.Duration(index) * time.Minute)}
		if err = c.preview(ctx, app, spec, event, false); err != nil {
			t.Fatal(err)
		}
		if err = c.Store.Pool.QueryRow(ctx, "SELECT id FROM resources WHERE data->>'previewOf'=$1", app.ID).Scan(&previewID); err != nil {
			t.Fatal(err)
		}
		routes, err := c.Store.Children(ctx, previewID, "route")
		if err != nil {
			t.Fatal(err)
		}
		if mode == "private" && len(routes) != 0 {
			t.Fatal("private preview retained a public route", routes)
		}
		if mode == "target" {
			if len(routes) != 1 {
				t.Fatal(routes)
			}
			route, err := model.Decode[model.Route](routes[0])
			if err != nil || route.TargetPort != spec.PreviewRouting.Port {
				t.Fatal("existing preview target was stale", route, err)
			}
		}
	}
}
