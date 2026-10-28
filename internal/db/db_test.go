package db

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
	"shipyard/internal/secure"
	"shipyard/internal/testdb"
	"testing"
	"time"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	url := testdb.URL(t)
	v, e := secure.New(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if e != nil {
		t.Fatal(e)
	}
	s, e := Open(context.Background(), url, v)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(s.Pool.Close)
	return s
}
func TestPermissionsSecretsAndOptimisticUpdates(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	team, project, env, app, otherTeam, userID, viewerID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	for _, id := range []string{userID, viewerID} {
		_, e := s.Pool.Exec(ctx, "INSERT INTO users(id,email,name,password) VALUES($1,$2,'test','disabled')", id, id+"@test.invalid")
		if e != nil {
			t.Fatal(e)
		}
	}
	for _, in := range []struct{ id, kind, parent, team string }{{team, "team", "", team}, {otherTeam, "team", "", otherTeam}, {project, "project", team, team}, {env, "environment", project, team}, {app, "application", env, team}} {
		if _, e := s.Save(ctx, in.id, model.ResourceInput{Kind: in.kind, Name: "test", ParentID: in.parent, TeamID: in.team, Data: json.RawMessage(`{}`), Secrets: map[string]string{"env:SECRET": "never-public"}}); e != nil {
			t.Fatal(e)
		}
	}
	_, _ = s.Pool.Exec(ctx, "INSERT INTO team_members(team_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'member')", team, userID, viewerID)
	_, _ = s.Pool.Exec(ctx, "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'operator'),($1,$3,'viewer')", project, userID, viewerID)
	resource, e := s.Resource(ctx, app)
	if e != nil {
		t.Fatal(e)
	}
	if !s.Access(ctx, model.User{ID: userID}, resource, true) || !s.Access(ctx, model.User{ID: viewerID}, resource, false) || s.Access(ctx, model.User{ID: viewerID}, resource, true) {
		t.Fatal("role boundary failed")
	}
	other, _ := s.Resource(ctx, otherTeam)
	if s.Access(ctx, model.User{ID: userID}, other, false) {
		t.Fatal("cross-team read allowed")
	}
	public, _ := json.Marshal(s.Public(resource))
	if string(public) == "" || contains(string(public), "never-public") {
		t.Fatal("secret leaked")
	}
	input := model.ResourceInput{Kind: "application", Name: "changed", Data: resource.Data, Version: resource.Version}
	if _, e = s.Save(ctx, app, input); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Save(ctx, app, input); e != pgx.ErrNoRows {
		t.Fatal("stale update accepted", e)
	}
	_, _ = s.Pool.Exec(ctx, "DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", project, userID)
	if s.Access(ctx, model.User{ID: userID}, resource, true) {
		t.Fatal("revocation ignored")
	}
}
func contains(s, needle string) bool {
	for i := 0; i+len(needle) <= len(s); i++ {
		if s[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
func TestDurableJobLeaseAndDedupe(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	key := uuid.NewString()
	if e := s.Enqueue(ctx, "test", key, key, nil); e != nil {
		t.Fatal(e)
	}
	_ = s.Enqueue(ctx, "test", key, key, nil)
	var count int
	_ = s.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE dedupe=$1", key).Scan(&count)
	if count != 1 {
		t.Fatal("duplicate job")
	}
	_, _ = s.Pool.Exec(ctx, "UPDATE jobs SET available_at=now()+interval '1 day' WHERE dedupe<>$1", key)
	j, e := s.Claim(ctx, "first")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Claim(ctx, "second"); e != pgx.ErrNoRows {
		t.Fatal("live lease stolen", e)
	}
	_, _ = s.Pool.Exec(ctx, "UPDATE jobs SET lease_until=$2 WHERE id=$1", j.ID, time.Now().Add(-time.Minute))
	recovered, e := s.Claim(ctx, "second")
	if e != nil || recovered.ID != j.ID || recovered.Attempts != 2 {
		t.Fatal("expired lease not recovered", e)
	}
	_, _ = s.Pool.Exec(ctx, "DELETE FROM jobs WHERE id=$1", j.ID)
}

func TestInterruptedDeploymentRetriesButHealthFailureDoesNot(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	app, err := s.Save(ctx, "", model.ResourceInput{Kind: "application", Name: "test", Data: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	id := uuid.NewString()
	_, err = s.Pool.Exec(ctx, "INSERT INTO deployments(id,app_id,state,phase,snapshot) VALUES($1,$2,'queued','reconcile',$3)", id, app.ID, []byte("test"))
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Enqueue(ctx, "deploy", app.ID, "retry-test", map[string]string{"deploymentId": id}); err != nil {
		t.Fatal(err)
	}
	j, err := s.Claim(ctx, "worker")
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Finish(ctx, j, "worker", errors.New("connection interrupted")); err != nil {
		t.Fatal(err)
	}
	var state string
	_ = s.Pool.QueryRow(ctx, "SELECT state FROM jobs WHERE id=$1", j.ID).Scan(&state)
	if state != "queued" {
		t.Fatal("interrupted deployment was not retried", state)
	}
	_, _ = s.Pool.Exec(ctx, "UPDATE jobs SET available_at=now() WHERE id=$1", j.ID)
	j, err = s.Claim(ctx, "worker")
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Stage(ctx, id, "failed", "failed", "readiness deadline exceeded"); err != nil {
		t.Fatal(err)
	}
	if err = s.Finish(ctx, j, "worker", errors.New("health failure")); err != nil {
		t.Fatal(err)
	}
	_ = s.Pool.QueryRow(ctx, "SELECT state FROM jobs WHERE id=$1", j.ID).Scan(&state)
	if state != "failed" {
		t.Fatal("health failure was automatically redeployed", state)
	}
}

func TestJobLanesKeepMetricsSeparateFromBuilds(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if err := s.Enqueue(ctx, "deploy", "app", "build", nil); err != nil {
		t.Fatal(err)
	}
	if err := s.Enqueue(ctx, "metrics", "server", "metrics", nil); err != nil {
		t.Fatal(err)
	}
	j, err := s.Claim(ctx, "sampler", "metrics")
	if err != nil || j.Kind != "metrics" {
		t.Fatal("metric worker claimed a build", j, err)
	}
	if _, err = s.Claim(ctx, "sampler", "metrics"); err != pgx.ErrNoRows {
		t.Fatal("metric worker consumed another lane", err)
	}
	j, err = s.Claim(ctx, "builder", "deploy")
	if err != nil || j.Kind != "deploy" {
		t.Fatal("build lane did not claim build", j, err)
	}
}

func TestRouteIdentityUsesDomainWithoutStoredName(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	input := model.ResourceInput{Kind: "route", Name: "discard this legacy name", Data: json.RawMessage(`{"domain":"api.example.com"}`)}
	route, err := s.Save(ctx, "", input)
	if err != nil {
		t.Fatal(err)
	}
	if route.Name != "api.example.com" {
		t.Fatal(route.Name)
	}
	var noName bool
	if err = s.Pool.QueryRow(ctx, "SELECT name IS NULL FROM resources WHERE id=$1", route.ID).Scan(&noName); err != nil || !noName {
		t.Fatal("route name persisted", err)
	}
	input.Name = ""
	input.Version = route.Version
	input.Data = json.RawMessage(`{"domain":"new.example.com"}`)
	if route, err = s.Save(ctx, route.ID, input); err != nil || route.Name != "new.example.com" {
		t.Fatal(route, err)
	}
	route, err = s.Resource(ctx, route.ID)
	if err != nil || route.Name != "new.example.com" {
		t.Fatal(route, err)
	}
}

func TestStaleUpdateCannotRecreateDeletedResource(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	r, err := s.Save(ctx, "", model.ResourceInput{Kind: "application", Name: "Backend", Data: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Pool.Exec(ctx, "DELETE FROM resources WHERE id=$1", r.ID); err != nil {
		t.Fatal(err)
	}
	_, err = s.Save(ctx, r.ID, model.ResourceInput{Kind: r.Kind, Name: "Backend 2", Data: r.Data, Version: r.Version})
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("deleted resource recreated by stale update", err)
	}
}
