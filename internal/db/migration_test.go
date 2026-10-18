package db

import (
	"context"
	"testing"
)

func TestMigrationsRoundTripHistoryAndApproval(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	catalog, e := MigrationCatalog()
	if e != nil {
		t.Fatal(e)
	}
	if len(catalog) != 5 {
		t.Fatal("update this test with the new schema")
	}
	if _, e = s.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password,disabled) VALUES('retained','retained@example.com','Retained','hash',true)"); e != nil {
		t.Fatal(e)
	}
	if e = ApplyMigrations(ctx, s.Pool, 1, false); e == nil {
		t.Fatal("destructive downgrade accepted without approval")
	}
	state, e := MigrationState(ctx, s.Pool)
	if e != nil || state.Current != 5 {
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
	if e = ApplyMigrations(ctx, s.Pool, 5, true); e != nil {
		t.Fatal(e)
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
