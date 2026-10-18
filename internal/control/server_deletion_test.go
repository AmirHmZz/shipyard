package control

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

type deletionNode struct {
	identity    string
	containers  []deletionContainer
	volumes     []deletionVolume
	networks    []DockerNetwork
	removed     []string
	fail        bool
	failCommand string
}

func (n *deletionNode) Close() error { return nil }
func (n *deletionNode) DialContext(context.Context, string, string) (net.Conn, error) {
	return nil, errors.New("unused")
}
func (n *deletionNode) OpenTerminal(context.Context, string, string, int, int) (remote.Terminal, error) {
	return nil, errors.New("unused")
}
func (n *deletionNode) RunSeparated(ctx context.Context, cmd string, in io.Reader, out, stderr io.Writer) error {
	return n.Run(ctx, cmd, in, out)
}
func (n *deletionNode) Run(_ context.Context, cmd string, _ io.Reader, out io.Writer) error {
	if n.fail {
		return errors.New("SSH disconnected")
	}
	if cmd == n.failCommand {
		n.failCommand = ""
		return errors.New("SSH interrupted during cleanup")
	}
	switch {
	case cmd == remote.Command("docker", "info", "--format", "{{.ID}}"):
		_, _ = io.WriteString(out, n.identity)
	case cmd == remote.Command("docker", "ps", "-aq"):
		for _, c := range n.containers {
			_, _ = io.WriteString(out, c.ID+"\n")
		}
	case strings.HasPrefix(cmd, remote.Command("docker", "container", "inspect")):
		return json.NewEncoder(out).Encode(n.containers)
	case cmd == remote.Command("docker", "volume", "ls", "-q"):
		for _, v := range n.volumes {
			_, _ = io.WriteString(out, v.Name+"\n")
		}
	case strings.HasPrefix(cmd, remote.Command("docker", "volume", "inspect")):
		return json.NewEncoder(out).Encode(n.volumes)
	case cmd == remote.Command("docker", "network", "ls", "-q"):
		for _, v := range n.networks {
			_, _ = io.WriteString(out, v.ID+"\n")
		}
	case strings.HasPrefix(cmd, remote.Command("docker", "network", "inspect")):
		return json.NewEncoder(out).Encode(n.networks)
	case strings.HasPrefix(cmd, remote.Command("docker", "rm", "-f")):
		for i, v := range n.containers {
			if strings.Contains(cmd, remote.Quote(v.ID)) {
				n.containers = append(n.containers[:i], n.containers[i+1:]...)
				n.removed = append(n.removed, v.ID)
				break
			}
		}
	case strings.HasPrefix(cmd, remote.Command("docker", "volume", "rm")):
		for i, v := range n.volumes {
			if strings.Contains(cmd, remote.Quote(v.Name)) {
				n.volumes = append(n.volumes[:i], n.volumes[i+1:]...)
				n.removed = append(n.removed, v.Name)
				break
			}
		}
	case strings.HasPrefix(cmd, remote.Command("docker", "network", "rm")):
		for i, v := range n.networks {
			if strings.Contains(cmd, remote.Quote(v.ID)) {
				n.networks = append(n.networks[:i], n.networks[i+1:]...)
				n.removed = append(n.removed, v.ID)
				break
			}
		}
	case strings.HasPrefix(cmd, remote.Command("docker", "ps", "-aq", "--filter")), strings.HasPrefix(cmd, remote.Command("docker", "image", "ls")), strings.HasPrefix(cmd, remote.Command("sh", "-c")), strings.HasPrefix(cmd, remote.Command("rm", "-rf")):
	default:
		return errors.New("unexpected command: " + cmd)
	}
	return nil
}
func deletionFixture(t *testing.T) (*Controller, model.Resource, model.Resource, *deletionNode) {
	t.Helper()
	c := testController(t)
	ctx := context.Background()
	host := resource(t, c, "server", "", "", model.Server{}, nil)
	app := resource(t, c, "application", "", "", model.App{ServerID: host.ID, Source: "compose", Engine: "compose"}, nil)
	id := uuid.NewString()
	raw, _ := json.Marshal(DeploymentSnapshot{App: model.App{ServerID: host.ID, Engine: "compose"}, Resource: app})
	encrypted, e := c.Store.Vault.Seal(raw, "deployment:"+id)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = c.Store.Pool.Exec(ctx, "INSERT INTO deployments(id,app_id,snapshot,state) VALUES($1,$2,$3,'failed')", id, app.ID, encrypted); e != nil {
		t.Fatal(e)
	}
	container := deletionContainer{ID: "container-1", Name: "/web"}
	container.Config.Labels = map[string]string{"shipyard.app": app.ID, "shipyard.release": id, "com.docker.compose.project": "sy-" + app.ID}
	n := &deletionNode{identity: "engine-1", containers: []deletionContainer{container}, volumes: []deletionVolume{{Name: "owned", Labels: map[string]string{"com.docker.compose.project": "sy-" + app.ID}}, {Name: "external"}}}
	c.DialNode = func(context.Context, model.Server, map[string]string) (remote.Node, error) { return n, nil }
	return c, host, app, n
}
func TestServerDeletionOwnedCleanupAndRestart(t *testing.T) {
	c, host, app, node := deletionFixture(t)
	ctx := context.Background()
	project := resource(t, c, "project", "", "", map[string]any{}, nil)
	otherHost := resource(t, c, "server", "", "", model.Server{}, nil)
	otherApp := resource(t, c, "application", project.ID, "", model.App{ServerID: otherHost.ID}, nil)
	plan, e := c.PlanServerDeletion(ctx, host.ID, "admin")
	if e != nil {
		t.Fatal(e)
	}
	if len(plan.Blockers) != 0 {
		t.Fatal(plan.Blockers)
	}
	// Settings are deliberately excluded from resource-revision approval; proxy
	// changes serialize under the proxy lock and host inventory is checked again.
	if _, e = c.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,'{}'),($2,'{}')", ProxySettingsKey(host.ID), "cpu:"+host.ID); e != nil {
		t.Fatal(e)
	}
	job, e := c.QueueServerDeletion(ctx, host.ID, "admin", ServerDeletionInput{plan.ID, host.Name, true})
	if e != nil {
		t.Fatal(e)
	}
	if again, err := c.QueueServerDeletion(ctx, host.ID, "admin", ServerDeletionInput{plan.ID, host.Name, true}); err != nil || again != job {
		t.Fatal("execution retry was not idempotent", again, err)
	}
	for _, r := range []model.Resource{host, app} {
		current, _ := c.Store.Resource(ctx, r.ID)
		if !model.IsDeleting(current) {
			t.Fatal("resource was not frozen")
		}
	}
	if _, e = c.Store.Save(ctx, "", model.ResourceInput{Kind: "application", Name: "late", Data: json.RawMessage(`{"serverId":"` + host.ID + `"}`)}); !errors.Is(e, db.ErrDeleting) {
		t.Fatal("new application bypassed freeze", e)
	}
	if _, e = c.Store.Save(ctx, "", model.ResourceInput{Kind: "network", Name: "late", ParentID: host.ID, Data: json.RawMessage(`{}`)}); !errors.Is(e, db.ErrDeleting) {
		t.Fatal("new network bypassed freeze", e)
	}
	node.identity = "changed"
	if e = c.deleteServer(ctx, model.Job{ID: job, ResourceID: host.ID}); e == nil {
		t.Fatal("changed daemon accepted")
	}
	if len(node.removed) != 0 {
		t.Fatal("destruction before identity verification")
	}
	status, _ := c.ServerDeletion(ctx, host.ID)
	if status.Error == "" {
		t.Fatal("error not persisted")
	}
	node.identity = "engine-1"
	closed := false
	c.terminals = map[string]map[string]func(){app.ID: {"one": func() { closed = true }}}
	if e = c.deleteServer(ctx, model.Job{ID: job, ResourceID: host.ID}); e != nil {
		t.Fatal(e)
	}
	if !closed {
		t.Fatal("terminal left open")
	}
	for _, id := range []string{host.ID, app.ID} {
		if _, e = c.Store.Resource(ctx, id); !errors.Is(e, pgx.ErrNoRows) {
			t.Fatal("resource retained", id, e)
		}
	}
	for _, r := range []model.Resource{project, otherHost, otherApp} {
		if _, e = c.Store.Resource(ctx, r.ID); e != nil {
			t.Fatal("unrelated resource removed", e)
		}
	}
	if len(node.volumes) != 1 || node.volumes[0].Name != "external" {
		t.Fatal("external volume lost", node.volumes)
	}
	status, e = c.ServerDeletion(ctx, host.ID)
	if e != nil || !status.Done {
		t.Fatal("completed result missing", e)
	}
	var leftovers int
	if e = c.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM settings WHERE key=ANY($1)", []string{ProxySettingsKey(host.ID), "cpu:" + host.ID}).Scan(&leftovers); e != nil || leftovers != 0 {
		t.Fatal("server settings retained", leftovers, e)
	}
	if e = c.deleteServer(ctx, model.Job{ID: job, ResourceID: host.ID}); e != nil {
		t.Fatal("retry after completion", e)
	}
}
func TestServerDeletionApprovalBoundaries(t *testing.T) {
	c, host, _, node := deletionFixture(t)
	ctx := context.Background()
	plan, e := c.PlanServerDeletion(ctx, host.ID, "admin")
	if e != nil {
		t.Fatal(e)
	}
	for _, attempt := range []struct {
		actor string
		in    ServerDeletionInput
	}{{"other", ServerDeletionInput{plan.ID, host.Name, true}}, {"admin", ServerDeletionInput{plan.ID, "wrong", true}}, {"admin", ServerDeletionInput{plan.ID, host.Name, false}}} {
		if _, e = c.QueueServerDeletion(ctx, host.ID, attempt.actor, attempt.in); e == nil {
			t.Fatal("unconfirmed deletion accepted")
		}
	}
	node.volumes = append(node.volumes, deletionVolume{Name: "late-owned", Labels: map[string]string{"com.docker.compose.project": node.containers[0].Config.Labels["com.docker.compose.project"]}})
	if _, e = c.QueueServerDeletion(ctx, host.ID, "admin", ServerDeletionInput{plan.ID, host.Name, true}); !errors.Is(e, db.ErrConflict) {
		t.Fatal("changed inventory accepted", e)
	}
	plan, e = c.PlanServerDeletion(ctx, host.ID, "admin")
	if e != nil {
		t.Fatal(e)
	}
	resource(t, c, "team", "", "", map[string]any{}, nil)
	if _, e = c.QueueServerDeletion(ctx, host.ID, "admin", ServerDeletionInput{plan.ID, host.Name, true}); !errors.Is(e, db.ErrConflict) {
		t.Fatal("changed revisions accepted", e)
	}
	node.fail = true
	if _, e = c.PlanServerDeletion(ctx, host.ID, "admin"); e == nil {
		t.Fatal("offline plan accepted")
	}
	local := resource(t, c, "server", "", "", model.Server{Connection: "local"}, nil)
	if _, e = c.PlanServerDeletion(ctx, local.ID, "admin"); e == nil {
		t.Fatal("local deletion allowed")
	}
}
func TestServerDeletionSharedVolumeBlocksBeforeDestruction(t *testing.T) {
	c, host, _, node := deletionFixture(t)
	unrelated := deletionContainer{ID: "unrelated", Name: "/other"}
	unrelated.Mounts = append(unrelated.Mounts, struct{ Type, Name, Source, Destination string }{Type: "volume", Name: "owned"})
	node.containers = append(node.containers, unrelated)
	plan, e := c.PlanServerDeletion(context.Background(), host.ID, "admin")
	if e != nil {
		t.Fatal(e)
	}
	if len(plan.Blockers) == 0 {
		t.Fatal("shared consumer not reported")
	}
	if _, e = c.QueueServerDeletion(context.Background(), host.ID, "admin", ServerDeletionInput{plan.ID, host.Name, true}); e == nil {
		t.Fatal("shared volume deletion allowed")
	}
}
func TestServerDeletionProxyOwnership(t *testing.T) {
	proxy := deletionContainer{Name: "/shipyard-haproxy"}
	proxy.HostConfig.NetworkMode = "host"
	proxy.Config.Cmd = []string{"haproxy", "-W", "-db", "-f", "/usr/local/etc/haproxy/haproxy.cfg"}
	for _, target := range []string{"/usr/local/etc/haproxy", "/var/lib/haproxy"} {
		proxy.Mounts = append(proxy.Mounts, struct{ Type, Name, Source, Destination string }{Type: "bind", Source: remote.Root + "/proxy", Destination: target})
	}
	if !ownedProxy(proxy) {
		t.Fatal("managed proxy rejected")
	}
	proxy.Mounts[0].Source = "/unrelated"
	if ownedProxy(proxy) {
		t.Fatal("name alone proved ownership")
	}
}

func TestServerDeletionDoesNotEraseRecreatedVolumeOnRetry(t *testing.T) {
	c, host, _, node := deletionFixture(t)
	ctx := context.Background()
	plan, e := c.PlanServerDeletion(ctx, host.ID, "admin")
	if e != nil {
		t.Fatal(e)
	}
	id, e := c.QueueServerDeletion(ctx, host.ID, "admin", ServerDeletionInput{plan.ID, host.Name, true})
	if e != nil {
		t.Fatal(e)
	}
	original := node.volumes[0]
	node.failCommand = remote.Command("docker", "network", "ls", "-q")
	if e = c.deleteServer(ctx, model.Job{ID: id, ResourceID: host.ID}); e == nil {
		t.Fatal("expected interrupted final verification")
	}
	node.volumes = append(node.volumes, original)
	if e = c.deleteServer(ctx, model.Job{ID: id, ResourceID: host.ID}); e == nil || !strings.Contains(e.Error(), "recreated") {
		t.Fatal("recreated volume was not protected", e)
	}
	count := 0
	for _, id := range node.removed {
		if id == "owned" {
			count++
		}
	}
	if count != 1 {
		t.Fatal("replacement volume erased", node.removed)
	}
}

func TestServerDeletionFreezesNetworkAndProxyWorkers(t *testing.T) {
	c, host, app, _ := deletionFixture(t)
	ctx := context.Background()
	network := resource(t, c, "network", host.ID, "", model.Network{ServerID: host.ID}, nil)
	plan, e := c.PlanServerDeletion(ctx, host.ID, "admin")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = c.QueueServerDeletion(ctx, host.ID, "admin", ServerDeletionInput{plan.ID, host.Name, true}); e != nil {
		t.Fatal(e)
	}
	if e = c.EnsureNetwork(ctx, network.ID); !errors.Is(e, db.ErrDeleting) {
		t.Fatal("network worker ignored deletion", e)
	}
	if _, e = c.QueueProxySettings(ctx, host.ID, "admin", ProxySettingsInput{}); !errors.Is(e, db.ErrDeleting) {
		t.Fatal("proxy settings bypassed deletion", e)
	}
	if e = c.syncProxy(ctx, host.ID, nil); !errors.Is(e, db.ErrDeleting) {
		t.Fatal("proxy worker ignored deletion", e)
	}
	current, _ := c.Store.Resource(ctx, network.ID)
	if !model.IsDeleting(current) {
		t.Fatal("worker cleared deletion flags")
	}
	if _, e = c.RegisterTerminal(ctx, app.ID, func() {}); e == nil {
		t.Fatal("terminal opened after freeze")
	}
}

func TestServerDeletionFinalizationRollbackKeepsRetryableState(t *testing.T) {
	c, host, _, _ := deletionFixture(t)
	ctx := context.Background()
	plan, e := c.PlanServerDeletion(ctx, host.ID, "admin")
	if e != nil {
		t.Fatal(e)
	}
	id, e := c.QueueServerDeletion(ctx, host.ID, "admin", ServerDeletionInput{plan.ID, host.Name, true})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = c.Store.Pool.Exec(ctx, `CREATE FUNCTION reject_server_finalization() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='server.deleted' THEN RAISE EXCEPTION 'finalization failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_server_finalization BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION reject_server_finalization()`); e != nil {
		t.Fatal(e)
	}
	if e = c.deleteServer(ctx, model.Job{ID: id, ResourceID: host.ID}); e == nil {
		t.Fatal("finalization failure was ignored")
	}
	status, e := c.ServerDeletion(ctx, host.ID)
	if e != nil || status.Done || status.Error == "" {
		t.Fatal("rolled-back deletion reported complete", status, e)
	}
	if _, e = c.Store.Resource(ctx, host.ID); e != nil {
		t.Fatal("server record disappeared before commit", e)
	}
	if _, e = c.Store.Pool.Exec(ctx, "DROP TRIGGER reject_server_finalization ON audit"); e != nil {
		t.Fatal(e)
	}
	if e = c.deleteServer(ctx, model.Job{ID: id, ResourceID: host.ID}); e != nil {
		t.Fatal(e)
	}
	var count int
	if e = c.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM audit WHERE action='server.deleted' AND resource_id=$1", host.ID).Scan(&count); e != nil || count != 1 {
		t.Fatal("completion audit not atomic", count, e)
	}
}

func TestServerDeletionCannotStartDuringVersionChange(t *testing.T) {
	c, host, _, _ := deletionFixture(t)
	ctx := context.Background()
	plan, e := c.PlanServerDeletion(ctx, host.ID, "admin")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = c.Store.Pool.Exec(ctx, `INSERT INTO settings(key,value) VALUES('platform-update','{"id":"change","state":"queued"}')`); e != nil {
		t.Fatal(e)
	}
	if _, e = c.QueueServerDeletion(ctx, host.ID, "admin", ServerDeletionInput{plan.ID, host.Name, true}); !errors.Is(e, db.ErrConflict) {
		t.Fatal("cleanup overlapped version change", e)
	}
	current, e := c.Store.Resource(ctx, host.ID)
	if e != nil || model.IsDeleting(current) {
		t.Fatal("blocked approval froze the server", e)
	}
}

func TestServerDeletionDurableWorkerResumeAndMaintenance(t *testing.T) {
	c, host, _, node := deletionFixture(t)
	ctx := context.Background()
	plan, e := c.PlanServerDeletion(ctx, host.ID, "admin")
	if e != nil {
		t.Fatal(e)
	}
	id, e := c.QueueServerDeletion(ctx, host.ID, "admin", ServerDeletionInput{plan.ID, host.Name, true})
	if e != nil {
		t.Fatal(e)
	}
	first, e := c.Store.Claim(ctx, "first", "server-delete")
	if e != nil || first.ID != id {
		t.Fatal(e)
	}
	if _, e = c.Store.Pool.Exec(ctx, `UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1`, id); e != nil {
		t.Fatal(e)
	}
	second, e := c.Store.Claim(ctx, "replacement", "server-delete")
	if e != nil || second.ID != id || second.Attempts != 2 {
		t.Fatal("expired lease was not reclaimed", second, e)
	}
	if _, e = c.Store.Pool.Exec(ctx, `INSERT INTO settings(key,value) VALUES('maintenance','true') ON CONFLICT(key) DO UPDATE SET value='true'`); e != nil {
		t.Fatal(e)
	}
	c.runJob(ctx, second, "replacement")
	if len(node.removed) != 0 {
		t.Fatal("cleanup started during maintenance")
	}
	if _, e = c.Store.Pool.Exec(ctx, `UPDATE settings SET value='false' WHERE key='maintenance';UPDATE jobs SET available_at=now() WHERE kind='server-delete'`); e != nil {
		t.Fatal(e)
	}
	resumed, e := c.Store.Claim(ctx, "resumed", "server-delete")
	if e != nil {
		t.Fatal(e)
	}
	restarted := &Controller{Store: c.Store, DataDir: c.DataDir, Logger: c.Logger, DialNode: c.DialNode}
	restarted.runJob(ctx, resumed, "resumed")
	status, e := c.ServerDeletion(ctx, host.ID)
	if e != nil || !status.Done {
		t.Fatal("resumed worker did not finish", status, e)
	}
	var state string
	if e = c.Store.Pool.QueryRow(ctx, "SELECT state FROM jobs WHERE id=$1", id).Scan(&state); e != nil || state != "done" {
		t.Fatal("worker did not acknowledge completion", state, e)
	}
}
