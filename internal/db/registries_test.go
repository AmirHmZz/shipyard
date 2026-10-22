package db

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"shipyard/internal/model"
)

func TestRegistryMigrationIsAtomicDeduplicatedAndIdempotent(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	team, err := s.Save(ctx, "", model.ResourceInput{Kind: "team", Name: "Team", Data: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	var apps []model.Resource
	for range 2 {
		r, e := s.Save(ctx, "", model.ResourceInput{Kind: "application", Name: "Legacy", TeamID: team.ID, Data: json.RawMessage(`{"registry":"GHCR.IO","registryUser":"alice"}`), Secrets: map[string]string{"registry_password": "old-token", "env:OTHER": "keep"}})
		if e != nil {
			t.Fatal(e)
		}
		apps = append(apps, r)
	}
	for range 2 {
		if err = s.MigrateRegistries(ctx); err != nil {
			t.Fatal(err)
		}
	}
	registries, err := s.Resources(ctx, "registry")
	if err != nil || len(registries) != 1 {
		t.Fatal(registries, err)
	}
	credentials, err := s.RegistryCredentials(ctx, team.ID)
	if err != nil || credentials["ghcr.io"].Password != "old-token" {
		t.Fatal(credentials, err)
	}
	public, _ := json.Marshal(s.Public(registries[0]))
	if strings.Contains(string(public), "old-token") {
		t.Fatal("token leaked")
	}
	for _, app := range apps {
		r, _ := s.Resource(ctx, app.ID)
		values, _ := s.Secrets(r)
		if strings.Contains(string(r.Data), "registry") || values["registry_password"] != "" || values["env:OTHER"] != "keep" {
			t.Fatal("incomplete migration")
		}
	}
	conflict, e := s.Save(ctx, "", model.ResourceInput{Kind: "registry", Name: "Other credential", Data: json.RawMessage(`{"hostname":"ghcr.io","username":"bob"}`), Secrets: map[string]string{"password": "another-token"}})
	if e != nil {
		t.Fatal(e)
	}
	if err = s.GrantRegistry(ctx, conflict.ID, team.ID, true); err == nil {
		t.Fatal("conflicting grant allowed")
	}
	if err = s.GrantRegistry(ctx, registries[0].ID, team.ID, false); err != nil {
		t.Fatal(err)
	}
	if credentials, err = s.RegistryCredentials(ctx, team.ID); err != nil || len(credentials) != 0 {
		t.Fatal(credentials, err)
	}
}

func TestRegistryMigrationConflictRollsBackEverything(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	team, err := s.Save(ctx, "", model.ResourceInput{Kind: "team", Name: "Team", Data: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	for _, password := range []string{"first-token", "other-token"} {
		if _, err = s.Save(ctx, "", model.ResourceInput{Kind: "application", Name: "Legacy", TeamID: team.ID, Data: json.RawMessage(`{"registry":"ghcr.io","registryUser":"alice"}`), Secrets: map[string]string{"registry_password": password}}); err != nil {
			t.Fatal(err)
		}
	}
	if err = s.MigrateRegistries(ctx); err == nil {
		t.Fatal("conflicting credentials migrated silently")
	}
	registries, _ := s.Resources(ctx, "registry")
	if len(registries) != 0 {
		t.Fatal("partial integrations committed")
	}
	apps, _ := s.Resources(ctx, "application")
	for _, r := range apps {
		values, _ := s.Secrets(r)
		if values["registry_password"] == "" {
			t.Fatal("legacy credential lost")
		}
	}
}

func TestRegistrySaveKeepsSecretAndChecksHostnameChanges(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	team, _ := s.Save(ctx, "", model.ResourceInput{Kind: "team", Name: "Team", Data: json.RawMessage(`{}`)})
	var regs []model.Resource
	for _, host := range []string{"index.docker.io", "ghcr.io"} {
		r, err := s.Save(ctx, "", model.ResourceInput{Kind: "registry", Name: host, Data: json.RawMessage(`{"hostname":"` + host + `","username":"alice"}`), Secrets: map[string]string{"password": "token"}})
		if err != nil {
			t.Fatal(err)
		}
		regs = append(regs, r)
		if err = s.GrantRegistry(ctx, r.ID, team.ID, true); err != nil {
			t.Fatal(err)
		}
	}
	r := regs[1]
	if _, err := s.Save(ctx, r.ID, model.ResourceInput{Kind: "registry", Name: r.Name, Version: r.Version, Data: json.RawMessage(`{"hostname":"registry-1.docker.io","username":"alice"}`)}); err == nil {
		t.Fatal("conflicting hostname update accepted")
	}
	r, err := s.Save(ctx, r.ID, model.ResourceInput{Kind: "registry", Name: "Renamed", Version: r.Version, Data: r.Data})
	if err != nil {
		t.Fatal(err)
	}
	values, _ := s.Secrets(r)
	if values["password"] != "token" {
		t.Fatal("blank edit discarded credential")
	}
}
