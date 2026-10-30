package db

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"

	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
)

func TestOrdinaryVariablesAndSecretReplacement(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	visible, empty := "https://example.com", ""
	in := model.ResourceInput{Kind: "project", Name: "test", Data: json.RawMessage(`{}`), Variables: map[string]*string{"env:ORIGIN": &visible, "env:EMPTY": &empty}, Secrets: map[string]string{"env:TOKEN": "hidden-token"}}
	r, err := s.Save(ctx, "", in)
	if err != nil {
		t.Fatal(err)
	}
	public, _ := json.Marshal(s.Public(r))
	if !bytes.Contains(public, []byte(visible)) || bytes.Contains(public, []byte("hidden-token")) {
		t.Fatal("public variable visibility is incorrect", string(public))
	}
	secrets, err := s.Secrets(r)
	if err != nil || secrets["env:ORIGIN"] != "" || secrets["env:TOKEN"] != "hidden-token" || bytes.Contains(r.Secret, []byte("hidden-token")) {
		t.Fatal("incorrect secret storage", err)
	}
	if v, exists := r.Variables["env:EMPTY"]; !exists || v != "" {
		t.Fatal("empty value was lost")
	}
	update := model.ResourceInput{Kind: r.Kind, Name: r.Name, Data: r.Data, Version: r.Version, Secrets: map[string]string{"env:ORIGIN": "new-hidden"}}
	r, err = s.Save(ctx, r.ID, update)
	if err != nil {
		t.Fatal(err)
	}
	if _, exists := r.Variables["env:ORIGIN"]; exists {
		t.Fatal("secret replacement retained plaintext")
	}
	if _, err = s.Save(ctx, r.ID, update); err != pgx.ErrNoRows {
		t.Fatal("stale version accepted", err)
	}
	update.Version = r.Version
	update.Secrets = nil
	update.Variables = map[string]*string{"env:ORIGIN": &visible, "env:EMPTY": nil}
	r, err = s.Save(ctx, r.ID, update)
	if err != nil {
		t.Fatal(err)
	}
	secrets, _ = s.Secrets(r)
	if _, exists := secrets["env:ORIGIN"]; exists {
		t.Fatal("ordinary replacement retained secret")
	}
	if _, exists := r.Variables["env:EMPTY"]; exists {
		t.Fatal("ordinary deletion failed")
	}
	if secrets["env:TOKEN"] != "hidden-token" {
		t.Fatal("unrelated secret changed")
	}
	update.Version = r.Version
	update.Variables = map[string]*string{"env:ORIGIN": &visible}
	update.Secrets = map[string]string{"env:ORIGIN": "conflict"}
	if _, err := s.Save(ctx, r.ID, update); err == nil {
		t.Fatal("conflicting writes accepted")
	}
}

func TestVariableMigrationPreservesEncryptedSecrets(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	r, err := s.Save(ctx, "", model.ResourceInput{Kind: "project", Name: "retained", Data: json.RawMessage(`{}`), Secrets: map[string]string{"env:TOKEN": "original"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := ApplyMigrations(ctx, s.Pool, 4, true); err != nil {
		t.Fatal(err)
	}
	if err := ApplyMigrations(ctx, s.Pool, 5, false); err != nil {
		t.Fatal(err)
	}
	// This fixture deliberately remains on schema 5. Read only that schema's
	// columns instead of using the current binary's resource projection.
	after := model.Resource{ID: r.ID}
	err = s.Pool.QueryRow(ctx, "SELECT secret,variables FROM resources WHERE id=$1", r.ID).Scan(&after.Secret, &after.Variables)
	if err != nil || !bytes.Equal(after.Secret, r.Secret) || len(after.Variables) != 0 {
		t.Fatal("migration changed existing values", err)
	}
	values, err := s.Secrets(after)
	if err != nil || values["env:TOKEN"] != "original" {
		t.Fatal("existing secret cannot be decrypted", err)
	}
	if err := ApplyMigrations(ctx, s.Pool, 4, false); err == nil {
		t.Fatal("destructive downgrade accepted")
	}
}
