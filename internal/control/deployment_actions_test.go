package control

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

func actionsFixture(t *testing.T) (*Controller, model.Resource, model.Resource) {
	t.Helper()
	c := testController(t)
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	host := resource(t, c, "server", "", "", model.Server{}, nil)
	if _, err := c.Store.Pool.Exec(context.Background(), "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", host.ID, team.ID); err != nil {
		t.Fatal(err)
	}
	app := resource(t, c, "application", "", team.ID, model.App{Source: "compose", Engine: "compose", ServerID: host.ID}, map[string]string{"compose": "services:\n  web:\n    image: busybox:1.37.0\n"})
	return c, host, app
}

func actionRelease(t *testing.T, c *Controller, app model.Resource) model.Release {
	t.Helper()
	ctx := context.Background()
	d, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	spec, _ := model.Decode[model.App](app)
	r := model.Release{ID: d.ID, DeploymentID: d.ID, AppID: app.ID, TeamID: app.TeamID, ServerID: spec.ServerID, App: spec, Compose: `{"services":{"web":{"image":"busybox"}}}`, Directory: remote.Root + "/releases/" + d.ID}
	if err = c.Store.SaveRelease(ctx, r); err != nil {
		t.Fatal(err)
	}
	if err = c.Store.Stage(ctx, d.ID, "healthy", "complete", ""); err != nil {
		t.Fatal(err)
	}
	// Direct controller execution normally has a leased worker to finish this job.
	_, err = c.Store.Pool.Exec(ctx, "UPDATE jobs SET state='done' WHERE payload->>'deploymentId'=$1", d.ID)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestDeploymentDeletionProtectsActivePendingAndRollback(t *testing.T) {
	c, _, app := actionsFixture(t)
	ctx := context.Background()
	active := actionRelease(t, c, app)
	if err := c.Store.Activate(ctx, active); err != nil {
		t.Fatal(err)
	}
	if _, err := c.QueueDeploymentDeletion(ctx, active.ID, "operator"); !errors.Is(err, ErrDeploymentProtected) {
		t.Fatal("active release deletable", err)
	}
	pending, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = c.QueueDeploymentDeletion(ctx, pending.ID, "operator"); !errors.Is(err, ErrDeploymentProtected) {
		t.Fatal("queued deployment deletable", err)
	}
	old := actionRelease(t, c, app)
	if _, err = c.Queue(ctx, app, "", old.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = c.QueueDeploymentDeletion(ctx, old.ID, "operator"); !errors.Is(err, ErrDeploymentProtected) {
		t.Fatal("rollback target deletable", err)
	}
}

func TestDeploymentDeletionDurableRetryAndComposeIsolation(t *testing.T) {
	c, _, app := actionsFixture(t)
	ctx := context.Background()
	old := actionRelease(t, c, app)
	active := actionRelease(t, c, app)
	if err := c.Store.Activate(ctx, active); err != nil {
		t.Fatal(err)
	}
	container := deletionContainer{ID: "active"}
	container.Config.Labels = map[string]string{"shipyard.app": app.ID, "shipyard.release": active.ID, "com.docker.compose.project": "sy-" + app.ID}
	node := &deletionNode{identity: "daemon", containers: []deletionContainer{container}, volumes: []deletionVolume{{Name: "data"}}, fail: true}
	c.DialNode = func(context.Context, model.Server, map[string]string) (remote.Node, error) { return node, nil }
	job, err := c.QueueDeploymentDeletion(ctx, old.ID, "operator")
	if err != nil {
		t.Fatal(err)
	}
	again, err := c.QueueDeploymentDeletion(ctx, old.ID, "operator")
	if err != nil || again != job {
		t.Fatal("not idempotent", err)
	}
	if _, err = c.Queue(ctx, app, "", old.ID); !errors.Is(err, ErrDeploymentProtected) {
		t.Fatal("rollback accepted deleting release", err)
	}
	if err = c.deleteDeployment(ctx, old.ID); err == nil {
		t.Fatal("connection failure ignored")
	}
	d, err := c.Store.Deployment(ctx, old.ID)
	if err != nil || !d.Deleting || d.DeletionError == "" {
		t.Fatal(d, err)
	}
	// Simulate a new controller after the failed worker exhausts its retries.
	_, err = c.Store.Pool.Exec(ctx, "UPDATE jobs SET state='failed' WHERE id=$1", job)
	if err != nil {
		t.Fatal(err)
	}
	restarted := &Controller{Store: c.Store, DialNode: c.DialNode, Logger: c.Logger}
	if retried, e := restarted.QueueDeploymentDeletion(ctx, old.ID, "operator"); e != nil || retried != job {
		t.Fatal("retry lost operation", e)
	}
	node.fail = false
	if err = restarted.deleteDeployment(ctx, old.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = c.Store.Deployment(ctx, old.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("history remains", err)
	}
	if _, err = c.Store.Release(ctx, old.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("release remains", err)
	}
	if len(node.containers) != 1 || node.containers[0].ID != "active" || len(node.volumes) != 1 {
		t.Fatal("active app or volume removed", node.removed)
	}
	if err = restarted.deleteDeployment(ctx, old.ID); err != nil {
		t.Fatal("completed retry failed", err)
	}
}

func TestDeploymentDeletionAndRollbackReservationRace(t *testing.T) {
	c, _, app := actionsFixture(t)
	ctx := context.Background()
	for i := 0; i < 8; i++ {
		r := actionRelease(t, c, app)
		var deletion, rollback error
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		go func() { defer wg.Done(); <-start; _, deletion = c.QueueDeploymentDeletion(ctx, r.ID, "operator") }()
		go func() { defer wg.Done(); <-start; _, rollback = c.Queue(ctx, app, "", r.ID) }()
		close(start)
		wg.Wait()
		if (deletion == nil) == (rollback == nil) {
			t.Fatalf("exactly one reservation must succeed: deletion=%v rollback=%v", deletion, rollback)
		}
	}
}

func TestFreshQueueImmutableModeAndVersion(t *testing.T) {
	c, _, app := actionsFixture(t)
	ctx := context.Background()
	d, err := c.QueueFresh(ctx, app, "")
	if err != nil {
		t.Fatal(err)
	}
	var raw []byte
	if err = c.Store.Pool.QueryRow(ctx, "SELECT snapshot FROM deployments WHERE id=$1", d.ID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	plain, err := c.Store.Vault.Open(raw, "deployment:"+d.ID)
	if err != nil {
		t.Fatal(err)
	}
	var snapshot DeploymentSnapshot
	if err = json.Unmarshal(plain, &snapshot); err != nil || !snapshot.Fresh {
		t.Fatal("fresh mode missing", err)
	}
	_, err = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: "changed", Version: app.Version, Data: app.Data})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = c.QueueFresh(ctx, app, ""); !errors.Is(err, db.ErrConflict) {
		t.Fatal("stale fresh request accepted", err)
	}
}

func TestFreshManifestEncryptionAndPendingRecoveryCoordination(t *testing.T) {
	c, _, app := actionsFixture(t)
	ctx := context.Background()
	waiting, err := c.Queue(ctx, app, "", "")
	if err != nil {
		t.Fatal(err)
	}
	d, err := c.QueueFresh(ctx, app, "")
	if err != nil {
		t.Fatal(err)
	}
	container := deletionContainer{ID: "container"}
	container.Config.Cmd = []string{"private-reset-password"}
	m := &freshDeployment{Application: app.ID, Started: true, Containers: []deletionContainer{container}, Volumes: []deletionVolume{{Name: "data", Options: map[string]string{"password": "private-driver-password"}}}}
	if err = c.saveFreshDeployment(ctx, d.ID, m); err != nil {
		t.Fatal(err)
	}
	var raw []byte
	if err = c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", freshDeploymentKey(d.ID)).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "private-reset-password") || strings.Contains(string(raw), "private-driver-password") {
		t.Fatal("reset credentials persisted in plaintext")
	}
	loaded, err := c.loadFreshDeployment(ctx, d.ID)
	if err != nil || digestJSON(loaded) != digestJSON(m) {
		t.Fatal("encrypted manifest cannot resume", err)
	}
	if started, e := c.freshDeploymentStarted(ctx, d.ID); e != nil || !started {
		t.Fatal(started, e)
	}
	if _, err = c.Queue(ctx, app, "", ""); !errors.Is(err, db.ErrConflict) {
		t.Fatal("deploy raced pending reset", err)
	}
	if err = c.Action(ctx, app, "start"); err == nil || !strings.Contains(err.Error(), "recovery") {
		t.Fatal("action raced pending reset", err)
	}
	if err = c.deploy(ctx, waiting.ID); !errors.Is(err, context.Canceled) {
		t.Fatal("queued deployment raced reset", err)
	}
	status, err := c.Store.Deployment(ctx, waiting.ID)
	if err != nil || status.State != "queued" || status.Phase != "reconcile" {
		t.Fatal(status, err)
	}
	if err = c.Store.Stage(ctx, d.ID, "failed", "failed", ""); err != nil {
		t.Fatal(err)
	}
	if _, err = c.Queue(ctx, app, "", ""); err != nil {
		t.Fatal("explicit recovery deploy blocked", err)
	}
}

func TestFreshInventoryPreservesExternalSharedAndBindData(t *testing.T) {
	c, _, app, node := deletionFixture(t)
	ctx := context.Background()
	id := node.containers[0].Config.Labels["shipyard.release"]
	spec, _ := model.Decode[model.App](app)
	r := model.Release{ID: id, DeploymentID: id, AppID: app.ID, ServerID: spec.ServerID, App: spec, Compose: `{"services":{"web":{"volumes":[{"type":"volume","target":"/anonymous"}]}},"volumes":{"external":{"name":"external","external":true}}}`}
	if err := c.Store.SaveRelease(ctx, r); err != nil {
		t.Fatal(err)
	}
	node.volumes = append(node.volumes, deletionVolume{Name: "shared", Labels: map[string]string{"com.docker.compose.project": "sy-" + app.ID}}, deletionVolume{Name: strings.Repeat("a", 64)})
	node.volumes[1].Labels = map[string]string{"com.docker.compose.project": "sy-" + app.ID}
	for _, mount := range []struct{ Type, Name, Source, Destination string }{{"volume", "owned", "", "/data"}, {"volume", strings.Repeat("a", 64), "", "/anonymous"}, {"bind", "", "/host/data", "/host"}} {
		node.containers[0].Mounts = append(node.containers[0].Mounts, mount)
	}
	node.containers[0].Config.Labels["com.docker.compose.service"] = "web"
	unrelated := deletionContainer{ID: "other"}
	unrelated.Mounts = append(unrelated.Mounts, struct{ Type, Name, Source, Destination string }{"volume", "shared", "", "/shared"})
	node.containers = append(node.containers, unrelated)
	m, err := c.inventoryFreshDeployment(ctx, node, r)
	if err != nil {
		t.Fatal(err)
	}
	if len(m.Containers) != 1 || len(m.Volumes) != 2 {
		t.Fatalf("wrong reset inventory: %+v", m)
	}
	for _, v := range m.Volumes {
		if v.Name != "owned" && v.Name != strings.Repeat("a", 64) {
			t.Fatal("protected volume selected", v.Name)
		}
	}
}

func TestFreshRetryRejectsChangedHostAndRecreatedVolume(t *testing.T) {
	c, _, app, node := deletionFixture(t)
	ctx := context.Background()
	id := uuid.NewString()
	spec, _ := model.Decode[model.App](app)
	r := model.Release{ID: id, AppID: app.ID, ServerID: spec.ServerID, App: spec}
	m := &freshDeployment{Application: app.ID, Daemon: node.identity, Started: true, Containers: node.containers, Volumes: []deletionVolume{node.volumes[0]}, Completed: map[string]bool{"owned": true}}
	if err := c.saveFreshDeployment(ctx, id, m); err != nil {
		t.Fatal(err)
	}
	var started bool
	if err := c.resetFreshDeployment(ctx, node, r, &started); err == nil || !strings.Contains(err.Error(), "replaced") || len(node.removed) != 0 {
		t.Fatal("replacement volume touched", err, node.removed)
	}
	m.Completed = map[string]bool{}
	m.Removing = map[string]bool{"owned": true}
	if err := c.saveFreshDeployment(ctx, id, m); err != nil {
		t.Fatal(err)
	}
	if err := c.resetFreshDeployment(ctx, node, r, &started); err == nil || !strings.Contains(err.Error(), "interrupted") || len(node.removed) != 0 {
		t.Fatal("ambiguous acknowledgement retried", err)
	}
	m.Removing = nil
	m.Volumes[0].CreatedAt = "old"
	if err := c.saveFreshDeployment(ctx, id, m); err != nil {
		t.Fatal(err)
	}
	if err := c.resetFreshDeployment(ctx, node, r, &started); err == nil || len(node.removed) != 0 {
		t.Fatal("unrecorded replacement touched", err)
	}
	m.ResetDone = true
	m.Daemon = "different"
	if err := c.saveFreshDeployment(ctx, id, m); err != nil {
		t.Fatal(err)
	}
	if err := c.resetFreshDeployment(ctx, node, r, &started); err == nil || !strings.Contains(err.Error(), "identity") {
		t.Fatal("changed host accepted", err)
	}
	m.Daemon = node.identity
	if err := c.saveFreshDeployment(ctx, id, m); err != nil {
		t.Fatal(err)
	}
	if err := c.resetFreshDeployment(ctx, node, r, &started); err != nil || len(node.removed) != 0 {
		t.Fatal("completed reset repeated", err)
	}
}
