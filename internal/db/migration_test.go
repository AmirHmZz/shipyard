package db

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"shipyard/internal/secure"
)

func TestMigrationsRoundTripHistoryAndApproval(t *testing.T) {
	const latest = 14
	s := testStore(t)
	ctx := context.Background()
	catalog, e := MigrationCatalog()
	if e != nil {
		t.Fatal(e)
	}
	if len(catalog) != latest {
		t.Fatal("update this test with the new schema")
	}
	if _, e = s.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,disabled) VALUES('retained','retained@example.com','Retained','hash',true)"); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Pool.Exec(ctx, "INSERT INTO resources(id,kind,name) VALUES('mcp-project','project','MCP project')"); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,admin) VALUES('issuer','issuer@example.com','Issuer','hash',true)"); e != nil {
		t.Fatal(e)
	}
	if _, _, e = s.IssueMCPToken(ctx, "issuer", "Migration test", []string{"mcp-project"}, 30); e != nil {
		t.Fatal(e)
	}
	if e = ApplyMigrations(ctx, s.Pool, 11, false); e == nil {
		t.Fatal("MCP credential downgrade accepted without approval")
	}
	if e = ApplyMigrations(ctx, s.Pool, 1, false); e == nil {
		t.Fatal("destructive downgrade accepted without approval")
	}
	state, e := MigrationState(ctx, s.Pool)
	if e != nil || state.Current != latest {
		t.Fatal(state, e)
	}
	if e = ApplyMigrations(ctx, s.Pool, 1, true); e != nil {
		t.Fatal(e)
	}
	var name string
	if e = s.Pool.QueryRow(ctx, "SELECT name FROM users WHERE id='retained'").Scan(&name); e != nil || name != "Retained" {
		t.Fatal("unrelated data lost", e)
	}
	if _, e = Open(ctx, testURLForPool(t, s), s.Vault); e == nil {
		t.Fatal("older schema was silently upgraded")
	}
	if e = ApplyMigrations(ctx, s.Pool, latest, true); e != nil {
		t.Fatal(e)
	}
	if tokens, err := s.MCPTokens(ctx, "issuer"); err != nil || len(tokens) != 0 {
		t.Fatalf("round trip retained MCP tokens: %d, %v", len(tokens), err)
	}
	if e = s.Pool.QueryRow(ctx, "SELECT name FROM resources WHERE id='mcp-project'").Scan(&name); e != nil || name != "MCP project" {
		t.Fatal("MCP project lost during round trip", name, e)
	}
	var disabled bool
	if e = s.Pool.QueryRow(ctx, "SELECT disabled FROM users WHERE id='retained'").Scan(&disabled); e != nil || disabled {
		t.Fatal("reverse migration did not discard only the declared account status", disabled, e)
	}
	if _, e = s.Pool.Exec(ctx, "UPDATE schema_versions SET up_checksum='tampered' WHERE version=2"); e != nil {
		t.Fatal(e)
	}
	if _, e = MigrationState(ctx, s.Pool); e == nil {
		t.Fatal("migration tampering accepted")
	}
}

func TestMCPTokenOwnershipMigration(t *testing.T) {
	s := testStore(t)
	ctx := t.Context()
	if err := ApplyMigrations(ctx, s.Pool, 12, true); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Pool.Exec(ctx, `
		INSERT INTO users(id,email,name,password,admin) VALUES('admin','admin@example.test','Admin','hash',true);
		INSERT INTO resources(id,kind,name) VALUES('project','project','Project');
		INSERT INTO mcp_tokens(id,name,token_hash,expires_at) VALUES('legacy','Legacy','legacy-hash',now()+interval '1 day');
		INSERT INTO mcp_token_projects(token_id,project_id) VALUES('legacy','project');`); err != nil {
		t.Fatal(err)
	}
	if err := ApplyMigrations(ctx, s.Pool, 13, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Pool.Exec(ctx, `
		INSERT INTO mcp_tokens(id,name,token_hash,expires_at,owner_id) VALUES('owned','Owned','owned-hash',now()+interval '1 day','admin');
		INSERT INTO mcp_token_projects(token_id,project_id) VALUES('owned','project');`); err != nil {
		t.Fatal(err)
	}
	if err := ApplyMigrations(ctx, s.Pool, 14, false); err != nil {
		t.Fatal(err)
	}
	if id, err := s.MCPTokenID(ctx, "owned-hash"); err != nil || id != "owned" {
		t.Fatalf("existing owned credential changed during grant migration: %q %v", id, err)
	}
	if _, err := s.MCPTokenID(ctx, "legacy-hash"); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("legacy credential survived the upgrade", err)
	}
	tokens, err := s.MCPTokens(ctx, "admin")
	if err != nil || len(tokens) != 2 || tokens[0].ID != "owned" || len(tokens[0].ProjectPermissions) != 0 ||
		tokens[1].ID != "legacy" || tokens[1].OwnerID != nil || tokens[1].RevokedAt == nil {
		t.Fatalf("expected a revoked legacy record: %+v %v", tokens, err)
	}
	if _, _, err := s.RecreateMCPToken(ctx, "admin", "legacy", 30); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("legacy token could be recreated", err)
	}
	_, secret, err := s.IssueMCPToken(ctx, "admin", "Replacement", []string{"project"}, 30)
	if err != nil {
		t.Fatal(err)
	}
	if err := ApplyMigrations(ctx, s.Pool, 12, false); err == nil {
		t.Fatal("downgrade accepted without data-loss approval")
	}
	if err := ApplyMigrations(ctx, s.Pool, 12, true); err != nil {
		t.Fatal(err)
	}
	var legacyRevoked, replacementExists bool
	err = s.Pool.QueryRow(ctx, `SELECT
		EXISTS (SELECT 1 FROM mcp_tokens WHERE id='legacy' AND revoked_at IS NOT NULL),
		EXISTS (SELECT 1 FROM mcp_tokens WHERE token_hash=$1)`, secure.Hash(secret)).Scan(&legacyRevoked, &replacementExists)
	if err != nil || !legacyRevoked || replacementExists {
		t.Fatalf("unexpected credentials after downgrade: legacy revoked=%t, replacement exists=%t: %v", legacyRevoked, replacementExists, err)
	}
}
func testURLForPool(t *testing.T, s *Store) string { t.Helper(); return s.Pool.Config().ConnString() }
func TestLegacyMigrationMetadataAndTransactionalFailure(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if e := ApplyMigrations(ctx, s.Pool, 4, true); e != nil {
		t.Fatal(e)
	}
	// Only versions 1-3 predate checksum metadata.
	if e := ApplyMigrations(ctx, s.Pool, 3, false); e != nil {
		t.Fatal(e)
	}
	if _, e := s.Pool.Exec(ctx, "ALTER TABLE schema_versions DROP COLUMN up_checksum;ALTER TABLE schema_versions DROP COLUMN down_checksum"); e != nil {
		t.Fatal(e)
	}
	if e := ApplyMigrations(ctx, s.Pool, 4, true); e != nil {
		t.Fatal(e)
	}
	var count int
	if e := s.Pool.QueryRow(ctx, "SELECT count(*) FROM schema_versions WHERE length(up_checksum)=64 AND length(down_checksum)=64").Scan(&count); e != nil || count != 4 {
		t.Fatal(count, e)
	}
	if _, e := s.Pool.Exec(ctx, "ALTER TABLE users DROP COLUMN disabled"); e != nil {
		t.Fatal(e)
	}
	if e := ApplyMigrations(ctx, s.Pool, 1, true); e == nil {
		t.Fatal("broken down migration unexpectedly succeeded")
	}
	state, e := MigrationState(ctx, s.Pool)
	if e != nil || state.Current != 4 {
		t.Fatal("partial migration history committed", state, e)
	}
	var ca bool
	if e = s.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='domain_state' AND column_name='certificate_ca')").Scan(&ca); e != nil || !ca {
		t.Fatal("earlier down step was not rolled back", ca, e)
	}
}

func TestRouteIdentityMigration(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if err := ApplyMigrations(ctx, s.Pool, 3, true); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Pool.Exec(ctx, `INSERT INTO resources(id,kind,name,data) VALUES('route','route','Legacy label','{"domain":"api.example.com"}'),('team','team','Keep me','{}')`); err != nil {
		t.Fatal(err)
	}
	if err := ApplyMigrations(ctx, s.Pool, 4, false); err == nil {
		t.Fatal("custom names discarded without declared data-loss approval")
	}
	if err := ApplyMigrations(ctx, s.Pool, 4, true); err != nil {
		t.Fatal(err)
	}
	var routeName, teamName string
	err := s.Pool.QueryRow(ctx, "SELECT data->>'domain' FROM resources WHERE id='route'").Scan(&routeName)
	if err != nil || routeName != "api.example.com" {
		t.Fatal(routeName, err)
	}
	err = s.Pool.QueryRow(ctx, "SELECT name FROM resources WHERE id='team'").Scan(&teamName)
	if err != nil || teamName != "Keep me" {
		t.Fatal(teamName, err)
	}
	if _, err := s.Pool.Exec(ctx, "UPDATE resources SET name='redundant' WHERE id='route'"); err == nil {
		t.Fatal("redundant route name accepted")
	}
	if err := ApplyMigrations(ctx, s.Pool, 3, false); err != nil {
		t.Fatal(err)
	}
	var name string
	if err := s.Pool.QueryRow(ctx, "SELECT name FROM resources WHERE id='route'").Scan(&name); err != nil || name != "api.example.com" {
		t.Fatal(name, err)
	}
}
