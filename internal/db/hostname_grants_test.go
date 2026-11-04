package db

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"

	"shipyard/internal/model"
)

func hostnameGrantFixtures(t *testing.T, s *Store) {
	t.Helper()
	_, err := s.Pool.Exec(context.Background(), `INSERT INTO resources(id,kind,name,parent_id,team_id,data) VALUES
		('zone','zone','example.com','','','{"domain":"example.com"}'),
		('team','team','Team','','team','{}'),
		('app','application','App','','team','{}')`)
	if err != nil {
		t.Fatal(err)
	}
}

func TestHostnameGrantsMigration(t *testing.T) {
	ctx := context.Background()
	s := testStore(t)
	if err := ApplyMigrations(ctx, s.Pool, 9, false); err != nil {
		t.Fatal(err)
	}
	hostnameGrantFixtures(t, s)
	if _, err := s.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES('zone','team')"); err != nil {
		t.Fatal(err)
	}
	if err := ApplyMigrations(ctx, s.Pool, 10, false); err != nil {
		t.Fatal(err)
	}
	grants, err := s.ZoneGrants(ctx, "zone")
	if err != nil || len(grants) != 1 || grants[0].Mode != "whole" {
		t.Fatalf("legacy grant was not preserved: %v, %v", grants, err)
	}
	err = s.SetZoneGrant(ctx, "admin", "zone", "team", ZoneGrant{
		Mode: "scoped", Patterns: []string{" API.EXAMPLE.COM. ", "api.example.com", "*.Préview.example.com"},
	}, false)
	if err != nil {
		t.Fatal(err)
	}
	grants, err = s.ZoneGrants(ctx, "zone")
	idnaName, _ := model.Domain("*.préview.example.com")
	if err != nil || len(grants) != 1 || !slices.Equal(grants[0].Patterns, []string{idnaName, "api.example.com"}) {
		t.Fatalf("grant was not canonicalized: %v, %v", grants, err)
	}
	if err = ApplyMigrations(ctx, s.Pool, 9, true); err == nil || !strings.Contains(err.Error(), "scoped hostname grants") {
		t.Fatalf("downgrade accepted a scoped grant: %v", err)
	}
}

func TestHostnameGrantDependencies(t *testing.T) {
	ctx := context.Background()
	s := testStore(t)
	hostnameGrantFixtures(t, s)
	setGrant := func(grant ZoneGrant) error {
		return s.SetZoneGrant(ctx, "admin", "zone", "team", grant, false)
	}
	if err := setGrant(ZoneGrant{Mode: "whole"}); err != nil {
		t.Fatal(err)
	}
	app, err := s.SaveWithZoneAccess(ctx, "app", model.ResourceInput{
		Kind: "application", Name: "App", TeamID: "team", Version: 1,
		Data: json.RawMessage(`{"previews":true,"previewZoneId":"zone","previewDomain":"*.preview.example.com"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	apiOnly := ZoneGrant{Mode: "scoped", Patterns: []string{"api.example.com"}}
	if err = setGrant(apiOnly); !errors.Is(err, ErrConflict) || !strings.Contains(err.Error(), "public preview *.preview.example.com") {
		t.Fatalf("narrowing lost the enabled preview: %v", err)
	}
	if err = setGrant(ZoneGrant{Mode: "scoped", Patterns: []string{"*.example.com"}}); err != nil {
		t.Fatal(err)
	}
	preview, err := s.Save(ctx, "preview", model.ResourceInput{
		Kind: "application", Name: "Preview", TeamID: "team",
		Data: json.RawMessage(`{"previewOf":"app","previewDomain":"*.preview.example.com"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	route, err := s.SaveWithZoneAccess(ctx, "", model.ResourceInput{
		Kind: "route", ParentID: preview.ID, TeamID: "team",
		Data: json.RawMessage(`{"domain":"pr-1.preview.example.com","zoneId":"zone"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.SaveWithZoneAccess(ctx, app.ID, model.ResourceInput{
		Kind: "application", Name: "App", TeamID: "team", Version: app.Version,
		Data: json.RawMessage(`{"previews":true,"previewZoneId":"zone","previewDomain":"*.preview.example.com","previewRouting":{"mode":"private"}}`),
	}); err != nil {
		t.Fatal(err)
	}
	if err = setGrant(ZoneGrant{Mode: "scoped", Patterns: []string{"pr-1.preview.example.com"}}); !errors.Is(err, ErrConflict) || !strings.Contains(err.Error(), "certificate") {
		t.Fatalf("narrowing lost the existing route's certificate scope: %v", err)
	}
	if _, err = s.Pool.Exec(ctx, "DELETE FROM resources WHERE id=$1", route.ID); err != nil {
		t.Fatal(err)
	}
	if err = setGrant(apiOnly); err != nil {
		t.Fatalf("private previews prevented narrowing after route cleanup: %v", err)
	}
}

func TestHostnameGrantAndRouteSaveAreSerialized(t *testing.T) {
	ctx := context.Background()
	s := testStore(t)
	hostnameGrantFixtures(t, s)
	if err := s.SetZoneGrant(ctx, "admin", "zone", "team", ZoneGrant{Mode: "whole"}, false); err != nil {
		t.Fatal(err)
	}
	start, saved, revoked := make(chan struct{}), make(chan error, 1), make(chan error, 1)
	go func() {
		<-start
		_, err := s.SaveWithZoneAccess(ctx, "", model.ResourceInput{
			Kind: "route", ParentID: "app", TeamID: "team",
			Data: json.RawMessage(`{"domain":"api.example.com","zoneId":"zone"}`),
		})
		saved <- err
	}()
	go func() {
		<-start
		revoked <- s.SetZoneGrant(ctx, "admin", "zone", "team", ZoneGrant{Mode: "none"}, false)
	}()
	close(start)
	saveErr, revokeErr := <-saved, <-revoked
	if (saveErr != nil || !errors.Is(revokeErr, ErrConflict)) &&
		(revokeErr != nil || !errors.Is(saveErr, ErrZoneGrant)) {
		t.Fatalf("unexpected outcomes: save=%v revoke=%v", saveErr, revokeErr)
	}
}
