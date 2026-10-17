package control

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"os"
	"os/exec"
	"path/filepath"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/remote"
	"strings"
	"testing"
	"time"
)

type deletionGit struct{}

func (deletionGit) Repositories(context.Context) ([]providers.Repository, error) { return nil, nil }
func (deletionGit) Branches(context.Context, string) ([]providers.Branch, error) { return nil, nil }
func (deletionGit) Checkout(ctx context.Context, _, _, dir string) (string, error) {
	if e := os.WriteFile(filepath.Join(dir, "Dockerfile"), []byte("FROM busybox:1.37.0\nCMD [\"sleep\",\"3600\"]\n"), 0600); e != nil {
		return "", e
	}
	for _, args := range [][]string{{"init", "--quiet"}, {"config", "user.email", "test@shipyard.invalid"}, {"config", "user.name", "Shipyard test"}, {"add", "."}, {"commit", "--quiet", "-m", "worker"}} {
		cmd := exec.CommandContext(ctx, "git", args...)
		cmd.Dir = dir
		if out, e := cmd.CombinedOutput(); e != nil {
			return "", errors.New(string(out))
		}
	}
	cmd := exec.CommandContext(ctx, "git", "rev-parse", "HEAD")
	cmd.Dir = dir
	out, e := cmd.Output()
	return strings.TrimSpace(string(out)), e
}

func TestLinuxServerDeletionOwnedResources(t *testing.T) {
	if os.Getenv("SHIPYARD_SERVER_DELETION_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires disposable SSH/Docker fixture")
	}
	c := testController(t)
	ctx, cancel := context.WithTimeout(context.Background(), 7*time.Minute)
	defer cancel()
	host := os.Getenv("SHIPYARD_FIXTURE_HOST")
	key, e := os.ReadFile(os.Getenv("SHIPYARD_FIXTURE_PRIVATE_KEY_FILE"))
	if e != nil {
		t.Fatal(e)
	}
	fp, e := remote.Fingerprint(ctx, host, 2222)
	if e != nil {
		t.Fatal(e)
	}
	server := resource(t, c, "server", "", "", model.Server{Host: host, Port: 2222, User: "root", Fingerprint: fp}, map[string]string{"private_key": string(key)})
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	project := resource(t, c, "project", team.ID, team.ID, map[string]any{}, nil)
	env := resource(t, c, "environment", project.ID, team.ID, map[string]any{}, nil)
	if _, e = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", server.ID, team.ID); e != nil {
		t.Fatal(e)
	}
	node, _, e := c.connect(ctx, server.ID)
	if e != nil {
		t.Fatal(e)
	}
	defer node.Close()
	run := func(args ...string) string {
		t.Helper()
		out, err := deploy.Output(ctx, node, args...)
		if err != nil {
			t.Fatal(args, err)
		}
		return out
	}
	suffix := uuid.NewString()
	externalVolume := "deletion-external-" + suffix
	externalNetwork := "deletion-external-net-" + suffix
	unrelated := "deletion-unrelated-" + suffix
	conflict := "deletion-conflict-" + suffix
	bindPath := "/srv/deletion-bind-" + suffix
	run("sh", "-c", "mkdir -p "+remote.Quote(bindPath)+"; printf keep >"+remote.Quote(bindPath+"/data"))
	run("docker", "volume", "create", externalVolume)
	run("docker", "network", "create", externalNetwork)
	run("docker", "run", "-d", "--name", unrelated, "--mount", "type=volume,src="+externalVolume+",dst=/data", "busybox:1.37.0", "sleep", "3600")
	source := `services:
  web:
    image: busybox:1.37.0
    command: ["sh", "-c", "mkdir -p /www; echo ok >/www/index.html; exec httpd -f -p 8080 -h /www"]
    volumes:
      - state:/state
      - /srv/deletion-bind:/bind
      - deletion-external:/external
volumes:
  state: {}
  deletion-external:
    external: true
`
	source = strings.ReplaceAll(source, "deletion-external", externalVolume)
	source = strings.ReplaceAll(source, "/srv/deletion-bind", bindPath)
	app := resource(t, c, "application", env.ID, team.ID, model.App{Source: "compose", Engine: "compose", ServerID: server.ID, Context: ".", File: "compose.yaml", HealthTimeout: 20}, map[string]string{"compose": source})
	route := resource(t, c, "route", app.ID, team.ID, model.Route{Protocol: "https", Domain: "raw.example.com", Service: "web", TargetPort: 8080, TLS: "terminate"}, nil)
	cert, _ := certificate(t)
	sealed, _ := c.Store.Vault.Seal(cert, "certificate:"+route.ID)
	if _, e = c.Store.Pool.Exec(ctx, "INSERT INTO domain_state(route_id,domain,certificate,expires_at,dns_state,certificate_state) VALUES($1,'raw.example.com',$2,now()+interval '1 hour','ready','ready')", route.ID, sealed); e != nil {
		t.Fatal(e)
	}
	external := resource(t, c, "network", server.ID, "", model.Network{ServerID: server.ID, DockerID: run("docker", "network", "inspect", "-f", "{{.Id}}", externalNetwork), DockerName: externalNetwork, Managed: false}, nil)
	d, e := c.Queue(ctx, app, "", "")
	if e != nil {
		t.Fatal(e)
	}
	if e = c.deploy(ctx, d.ID); e != nil {
		var log string
		_ = c.Store.Pool.QueryRow(ctx, "SELECT string_agg(message,E'\n' ORDER BY id) FROM events WHERE deployment_id=$1", d.ID).Scan(&log)
		t.Fatal(e, log)
	}
	active, e := c.Store.Active(ctx, app.ID)
	if e != nil {
		t.Fatal(e)
	}
	git := resource(t, c, "git", "", "", model.Git{Provider: "gitea"}, nil)
	if _, e = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", git.ID, team.ID); e != nil {
		t.Fatal(e)
	}
	c.GitFactory = func(model.Git, map[string]string) providers.GitProvider { return deletionGit{} }
	worker := resource(t, c, "application", env.ID, team.ID, model.App{Engine: "dockerfile", ServerID: server.ID, GitID: git.ID, Repository: "owner/worker", Branch: "main", Context: ".", File: "Dockerfile", Worker: true, HealthTimeout: 20}, nil)
	workerDeployment, e := c.Queue(ctx, worker, "", "")
	if e != nil {
		t.Fatal(e)
	}
	if e = c.deploy(ctx, workerDeployment.ID); e != nil {
		var log string
		_ = c.Store.Pool.QueryRow(ctx, "SELECT string_agg(message,E'\n' ORDER BY id) FROM events WHERE deployment_id=$1", workerDeployment.ID).Scan(&log)
		t.Fatal(e, log)
	}
	directory := active.Directory
	// A whole-directory delete would erase this file. The inventory must retain it.
	run("sh", "-c", "printf keep >"+remote.Quote(directory+"/operator-notes.txt"))
	plan, e := c.PlanServerDeletion(ctx, server.ID, "test")
	if e != nil {
		t.Fatal(e)
	}
	if len(plan.Blockers) > 0 {
		t.Fatal(plan.Blockers)
	}
	volume := ""
	for _, item := range plan.Remove {
		if item.Kind == "volume" && strings.HasSuffix(item.Name, "_state") {
			volume = item.Name
		}
	}
	if volume == "" {
		raw, _ := json.Marshal(plan)
		t.Fatal("owned volume not inventoried", string(raw))
	}
	job, e := c.QueueServerDeletion(ctx, server.ID, "test", ServerDeletionInput{plan.ID, server.Name, true})
	if e != nil {
		t.Fatal(e)
	}
	// Failed removal is retryable and must not delete the dashboard records.
	run("docker", "run", "-d", "--name", conflict, "--mount", "type=volume,src="+volume+",dst=/data", "busybox:1.37.0", "sleep", "3600")
	if e = c.deleteServer(ctx, model.Job{ID: job, ResourceID: server.ID}); e == nil {
		t.Fatal("unrelated consumer did not block volume removal")
	}
	if _, e = c.Store.Resource(ctx, server.ID); e != nil {
		t.Fatal("server forgotten after cleanup failure")
	}
	run("docker", "rm", "-f", conflict)
	// Simulate a replacement controller resuming its persisted approved manifest.
	restarted := &Controller{Store: c.Store, DataDir: c.DataDir, Logger: c.Logger}
	if e = restarted.deleteServer(ctx, model.Job{ID: job, ResourceID: server.ID}); e != nil {
		t.Fatal(e)
	}
	for _, r := range []model.Resource{server, app, worker, route, external} {
		if _, e = c.Store.Resource(ctx, r.ID); !errors.Is(e, pgx.ErrNoRows) {
			t.Fatal("managed record retained", r.Kind, e)
		}
	}
	for _, r := range []model.Resource{team, project, env, git} {
		if _, e = c.Store.Resource(ctx, r.ID); e != nil {
			t.Fatal("parent resource lost", e)
		}
	}
	run("docker", "inspect", unrelated)
	run("docker", "volume", "inspect", externalVolume)
	run("docker", "network", "inspect", externalNetwork)
	if run("cat", bindPath+"/data") != "keep" || run("cat", directory+"/operator-notes.txt") != "keep" {
		t.Fatal("unowned data changed")
	}
	if out := run("docker", "volume", "ls", "-q", "--filter", "name="+volume); out != "" {
		t.Fatal("owned volume retained", out)
	}
	if out := run("docker", "ps", "-aq", "--filter", "name=^/shipyard-haproxy$"); out != "" {
		t.Fatal("proxy retained", out)
	}
	run("sh", "-c", "test ! -e "+remote.Quote(directory+"/runtime.json")+" && test ! -e /var/lib/shipyard/proxy/haproxy.cfg")
	run("sh", "-c", "test ! -e "+remote.Quote(remote.Root+"/releases/"+workerDeployment.ID+"/source/Dockerfile"))
	if e = restarted.deleteServer(ctx, model.Job{ID: job, ResourceID: server.ID}); e != nil {
		t.Fatal("completed replay failed", e)
	}
}
