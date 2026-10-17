package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/ssh"
	"shipyard/internal/certs"
	"shipyard/internal/db"
	"shipyard/internal/db/query"
	"shipyard/internal/deploy"
	"shipyard/internal/gitauth"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/remote"
)

type Controller struct {
	InitialDomain     string
	InitialIPv4       string
	InitialIPv6       string
	Local             *remote.Docker
	SelfContainer     string
	DashboardDNSCheck func(context.Context, string, model.Server) error
	DashboardVerify   func(context.Context, string) error
	Store             *db.Store
	Issuer            certs.Issuer
	DataDir           string
	Logger            *slog.Logger
	GitFactory        func(model.Git, map[string]string) providers.GitProvider
	DNSFactory        func(string, string) providers.DNSProvider
}
type DeploymentSnapshot struct {
	Resource         model.Resource    `json:"resource"`
	App              model.App         `json:"app"`
	Env              map[string]string `json:"env"`
	BuildSecrets     map[string]string `json:"buildSecrets"`
	Routes           []model.Resource  `json:"routes"`
	Ref              string            `json:"ref"`
	RegistryPassword string            `json:"registryPassword"`
	ComposeSource    string            `json:"composeSource,omitempty"`
}

func (c *Controller) Queue(ctx context.Context, app model.Resource, ref, rollback string) (model.Deployment, error) {
	return c.queue(ctx, app, ref, rollback, "")
}
func (c *Controller) queue(ctx context.Context, app model.Resource, ref, rollback, key string) (model.Deployment, error) {
	if c.Store.Maintenance(ctx) {
		return model.Deployment{}, errors.New("Shipyard is in maintenance mode")
	}
	spec, e := model.Decode[model.App](app)
	if e != nil {
		return model.Deployment{}, e
	}
	if app.Kind != "application" {
		return model.Deployment{}, errors.New("application required")
	}
	if spec.PreviewClosed {
		return model.Deployment{}, errors.New("pull request preview is closed")
	}
	if spec.PreviewOf != "" && rollback == "" && (spec.ApprovedSHA == "" || spec.ApprovedSHA != spec.PreviewSHA || ref != spec.ApprovedSHA) {
		return model.Deployment{}, errors.New("preview requires approval for this exact commit")
	}
	if !c.Store.TeamGranted(ctx, app.TeamID, spec.ServerID) || (spec.Source != "compose" && !c.Store.TeamGranted(ctx, app.TeamID, spec.GitID)) {
		return model.Deployment{}, errors.New("server and Git connection must be granted to this team")
	}
	snapshot := DeploymentSnapshot{Resource: c.Store.Public(app), App: spec, Env: map[string]string{}, BuildSecrets: map[string]string{}, Ref: ref}
	if spec.Source == "compose" {
		if ref != "" {
			return model.Deployment{}, errors.New("Direct Compose deployments do not accept a Git ref")
		}
		values, err := c.Store.Secrets(app)
		if err != nil {
			return model.Deployment{}, err
		}
		snapshot.ComposeSource = values["compose"]
		if rollback == "" {
			if err := model.ValidateComposeSource(snapshot.ComposeSource); err != nil {
				return model.Deployment{}, err
			}
		}
	}
	if snapshot.Ref == "" {
		snapshot.Ref = spec.Branch
	}
	chain := []model.Resource{app}
	parent := app
	for i := 0; i < 8 && parent.ParentID != ""; i++ {
		parent, e = c.Store.Resource(ctx, parent.ParentID)
		if e != nil {
			return model.Deployment{}, e
		}
		chain = append(chain, parent)
	}
	for i := len(chain) - 1; i >= 0; i-- {
		values, e := c.Store.Secrets(chain[i])
		if e != nil {
			return model.Deployment{}, e
		}
		for k, v := range values {
			envPrefix, buildPrefix := "env:", "build:"
			if spec.PreviewOf != "" && chain[i].ID != app.ID {
				envPrefix, buildPrefix = "preview-env:", "preview-build:"
			}
			if strings.HasPrefix(k, envPrefix) {
				snapshot.Env[strings.TrimPrefix(k, envPrefix)] = v
			}
			if strings.HasPrefix(k, buildPrefix) {
				snapshot.BuildSecrets[strings.TrimPrefix(k, buildPrefix)] = v
			}
			if chain[i].ID == app.ID && k == "registry_password" {
				snapshot.RegistryPassword = v
			}
		}
	}
	snapshot.Routes, e = c.Store.Children(ctx, app.ID, "route")
	if e != nil {
		return model.Deployment{}, e
	}
	id := uuid.NewString()
	if key != "" {
		id = uuid.NewSHA1(uuid.NameSpaceURL, []byte(key+":"+app.ID)).String()
	}
	b, e := json.Marshal(snapshot)
	if e != nil {
		return model.Deployment{}, e
	}
	encrypted, e := c.Store.Vault.Seal(b, "deployment:"+id)
	if e != nil {
		return model.Deployment{}, e
	}
	tx, e := c.Store.Pool.Begin(ctx)
	if e != nil {
		return model.Deployment{}, e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('resource-tree',0))"); e != nil {
		return model.Deployment{}, e
	}
	var deleting bool
	if e = tx.QueryRow(ctx, "SELECT COALESCE(data->>'deleting','false')='true' FROM resources WHERE id=$1", app.ID).Scan(&deleting); e != nil {
		return model.Deployment{}, e
	}
	if deleting {
		return model.Deployment{}, db.ErrDeleting
	}
	if spec.PreviewOf != "" {
		var enabled bool
		if e = tx.QueryRow(ctx, "SELECT COALESCE(data->>'previews','false')='true' FROM resources WHERE id=$1", spec.PreviewOf).Scan(&enabled); e != nil {
			return model.Deployment{}, e
		}
		if !enabled {
			return model.Deployment{}, errors.New("PR previews are disabled")
		}
	}
	if _, e = tx.Exec(ctx, "INSERT INTO deployments(id,app_id,snapshot,rollback_id) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING", id, app.ID, encrypted, rollback); e != nil {
		return model.Deployment{}, e
	}
	payload, _ := json.Marshal(map[string]string{"deploymentId": id})
	if _, e = tx.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,payload,dedupe) VALUES($1,'deploy',$2,$3,$4) ON CONFLICT(dedupe) DO NOTHING", uuid.NewString(), app.ID, payload, "deployment:"+id); e != nil {
		return model.Deployment{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return model.Deployment{}, e
	}
	return c.Store.Deployment(ctx, id)
}
func (c *Controller) Run(ctx context.Context) {
	var wg sync.WaitGroup
	if c.Local != nil {
		for {
			err := c.InitializeLocal(ctx)
			if err == nil {
				if state, e := c.dashboardSettings(ctx); e != nil {
					err = e
				} else if state.Domain == "" && c.InitialDomain != "" {
					_, err = c.QueueDashboard(ctx, state.Version, c.InitialDomain, "system")
				}
				if err == nil {
					err = c.syncProxy(ctx, LocalServerID, nil)
				}
			}
			if err == nil {
				break
			}
			c.Logger.Error("local host initialization failed; jobs are waiting", "error", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(10 * time.Second):
			}
		}
	}
	ops := []string{"git-event", "domain", "proxy", "proxy-settings", "provision", "prune", "notify", "preview-cleanup", "drain", "resource-delete", "network-create", "network-delete", "dashboard-apply", "dashboard-retire"}
	// Long builds and DNS challenges cannot monopolize metric sampling or all
	// operational workers. Every lane still uses the same durable job leases.
	for _, kinds := range [][]string{{"deploy"}, {"deploy"}, ops, ops, {"metrics"}} {
		wg.Add(1)
		go func() { defer wg.Done(); c.worker(ctx, uuid.NewString(), kinds) }()
	}
	wg.Add(1)
	go func() { defer wg.Done(); c.scheduler(ctx) }()
	<-ctx.Done()
	wg.Wait()
}
func (c *Controller) worker(ctx context.Context, worker string, kinds []string) {
	for {
		if ctx.Err() != nil {
			return
		}
		if c.Store.Maintenance(ctx) {
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
			}
			continue
		}
		j, e := c.Store.Claim(ctx, worker, kinds...)
		if errors.Is(e, pgx.ErrNoRows) {
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
			}
			continue
		}
		if e != nil {
			c.Logger.Error("claim job", "error", e)
			select {
			case <-ctx.Done():
				return
			case <-time.After(3 * time.Second):
			}
			continue
		}
		c.runJob(ctx, j, worker)
	}
}
func (c *Controller) runJob(parent context.Context, j model.Job, worker string) {
	// Maintenance may start after the worker's pre-claim check. A late claim
	// must not begin host mutations after the updater has drained running jobs.
	if c.Store.Maintenance(parent) {
		_, e := c.Store.Pool.Exec(parent, "UPDATE jobs SET state='queued',available_at=now()+interval '3 seconds',worker=NULL,lease_until=NULL WHERE id=$1 AND worker=$2", j.ID, worker)
		if e != nil {
			c.Logger.Error("defer claimed job during maintenance", "error", e)
		}
		return
	}
	ctx, cancel := context.WithTimeout(parent, 45*time.Minute)
	defer cancel()
	conn, e := c.Store.Pool.Acquire(ctx)
	if e != nil {
		_ = c.Store.Finish(parent, j, worker, e)
		return
	}
	defer conn.Release()
	lock := "application:" + j.ResourceID
	if j.Kind == "resource-delete" {
		lock = "deletion:" + j.ResourceID
	}
	if j.Kind == "proxy" || j.Kind == "proxy-settings" || j.Kind == "metrics" || j.Kind == "provision" {
		lock = "server:" + j.ResourceID
	}
	var acquired bool
	e = conn.QueryRow(ctx, "SELECT pg_try_advisory_lock(hashtextextended($1,0))", lock).Scan(&acquired)
	if e != nil || !acquired {
		_, _ = c.Store.Pool.Exec(parent, "UPDATE jobs SET state='queued',available_at=now()+interval '3 seconds',lease_until=NULL WHERE id=$1 AND worker=$2", j.ID, worker)
		return
	}
	defer conn.Exec(context.WithoutCancel(parent), "SELECT pg_advisory_unlock(hashtextextended($1,0))", lock)
	done := make(chan struct{})
	defer close(done)
	go func() {
		tick := time.NewTicker(20 * time.Second)
		defer tick.Stop()
		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case <-tick.C:
				count, e := query.New(c.Store.Pool).Heartbeat(ctx, query.HeartbeatParams{ID: j.ID, Worker: pgtype.Text{String: worker, Valid: true}})
				if e != nil || count != 1 {
					cancel()
					return
				}
			}
		}
	}()
	resource, lookupErr := c.Store.Resource(ctx, j.ResourceID)
	if j.Kind != "resource-delete" && (errors.Is(lookupErr, pgx.ErrNoRows) || (lookupErr == nil && model.IsDeleting(resource))) {
		_ = c.Store.Finish(context.WithoutCancel(parent), j, worker, nil)
		return
	}
	switch j.Kind {
	case "dashboard-apply":
		e = c.dashboardJob(ctx, j.Kind, j.Payload)
	case "dashboard-retire":
		e = c.retireDashboardRoute(ctx, j.Payload)
	case "network-create":
		e = c.EnsureNetwork(ctx, j.ResourceID)
	case "network-delete":
		r, err := c.Store.Resource(ctx, j.ResourceID)
		e = err
		if e == nil {
			e = c.DeleteNetwork(ctx, r)
			if e != nil {
				s, _ := model.Decode[model.Network](r)
				s.Status = "failed"
				s.Error = e.Error()
				_ = c.writeNetwork(ctx, r, s)
			}
		}
	case "resource-delete":
		e = c.deleteTree(ctx, j)
	case "deploy":
		var p struct {
			ID string `json:"deploymentId"`
		}
		e = json.Unmarshal(j.Payload, &p)
		if e == nil {
			e = c.deploy(ctx, p.ID)
		}
	case "git-event":
		var p struct {
			Event    string          `json:"event"`
			Body     json.RawMessage `json:"body"`
			Delivery string          `json:"delivery"`
		}
		e = json.Unmarshal(j.Payload, &p)
		if e == nil {
			e = c.GitEvent(ctx, j.ResourceID, p.Event, p.Body, p.Delivery)
		}
	case "domain":
		var p struct {
			Mode string `json:"mode"`
		}
		_ = json.Unmarshal(j.Payload, &p)
		e = c.domain(ctx, j.ResourceID, p.Mode)
	case "proxy":
		e = c.syncProxy(ctx, j.ResourceID, nil)
	case "proxy-settings":
		e = c.applyProxySettings(ctx, j)
	case "provision":
		e = c.provision(ctx, j.ResourceID)
	case "metrics":
		e = c.metrics(ctx, j.ResourceID)
	case "prune":
		e = c.prune(ctx, j.ResourceID)
	case "notify":
		e = c.notify(ctx, j)
	case "preview-cleanup":
		e = c.cleanupPreview(ctx, j.ResourceID)
	case "drain":
		var p struct {
			ReleaseID string `json:"releaseId"`
		}
		_ = json.Unmarshal(j.Payload, &p)
		e = c.drain(ctx, p.ReleaseID)
	default:
		e = errors.New("unknown job kind")
	}
	if e != nil {
		c.Logger.Error("job failed", "kind", j.Kind, "resource", j.ResourceID, "error", e)
	}
	if err := c.Store.Finish(context.WithoutCancel(parent), j, worker, e); err != nil {
		c.Logger.Error("finish job", "error", err)
	}
}
func (c *Controller) connect(ctx context.Context, id string) (remote.Node, model.Resource, error) {
	r, e := c.Store.Resource(ctx, id)
	if e != nil {
		return nil, r, e
	}
	s, e := model.Decode[model.Server](r)
	if e != nil {
		return nil, r, e
	}
	if s.Connection == "local" {
		if c.Local == nil {
			return nil, r, errors.New("local Docker access is disabled")
		}
		identity, err := c.Local.Identity(ctx)
		if err != nil {
			return nil, r, err
		}
		if identity != s.DaemonID {
			return nil, r, errors.New("local Docker host identity changed; verify it before resuming operations")
		}
		return c.Local, r, nil
	}
	secrets, e := c.Store.Secrets(r)
	if e != nil {
		return nil, r, e
	}
	client, e := remote.Dial(ctx, s, secrets["private_key"], secrets["password"])
	if e == nil && c.Local != nil {
		info, err := client.Output(ctx, "docker", "info", "--format", "{{.ID}}")
		if err != nil {
			client.Close()
			return nil, r, err
		}
		localID, err := c.Local.Identity(ctx)
		if err != nil {
			client.Close()
			return nil, r, err
		}
		if strings.TrimSpace(info) == localID {
			client.Close()
			return nil, r, errors.New("this Docker daemon is registered as Local host; use its canonical server resource")
		}
	}
	return client, r, e
}
func (c *Controller) provision(ctx context.Context, id string) error {
	r, err := c.Store.Resource(ctx, id)
	if err != nil {
		return err
	}
	s, _ := model.Decode[model.Server](r)
	if s.Connection == "local" {
		return errors.New("local host does not require SSH provisioning")
	}
	client, _, e := c.connect(ctx, id)
	if e != nil {
		return e
	}
	defer client.Close()
	var log strings.Builder
	e = client.Run(ctx, remote.Command("sh", "-c", remote.Provision), nil, &log)
	detail := map[string]string{"result": log.String()}
	_ = c.Store.Audit(ctx, "system", "server.provision", id, "", detail)
	return e
}

type redactor struct {
	mu      sync.Mutex
	values  []string
	write   func(string)
	pending string
}

func interrupted(err error) bool {
	var netErr net.Error
	var exitMissing *ssh.ExitMissingError
	return errors.Is(err, context.Canceled) || errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) || errors.As(err, &netErr) || errors.As(err, &exitMissing)
}

func (w *redactor) Write(b []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.pending += string(b)
	for {
		index := strings.IndexByte(w.pending, '\n')
		if index < 0 {
			break
		}
		line := w.pending[:index]
		w.pending = w.pending[index+1:]
		w.emit(line)
	}
	if len(w.pending) > 32768 {
		w.emit("[oversized log line omitted]")
		w.pending = ""
	}
	return len(b), nil
}
func (w *redactor) emit(line string) {
	for _, v := range w.values {
		if v != "" {
			line = strings.ReplaceAll(line, v, "[redacted]")
		}
	}
	w.write(line)
}
func (w *redactor) Flush() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.pending != "" {
		w.emit(w.pending)
		w.pending = ""
	}
}
func (c *Controller) deploy(ctx context.Context, id string) (result error) {
	d, e := c.Store.Deployment(ctx, id)
	if e != nil {
		return e
	}
	if d.State == "healthy" || d.State == "failed" || d.State == "recovery_failed" {
		return nil
	}
	current, e := c.Store.Resource(ctx, d.AppID)
	if e != nil {
		return e
	}
	currentSpec, e := model.Decode[model.App](current)
	if e != nil {
		return e
	}
	if currentSpec.PreviewClosed {
		return c.Store.Stage(ctx, id, "failed", "cancelled", "Pull request preview is closed")
	}
	if model.IsDeleting(current) {
		return c.Store.Stage(ctx, id, "failed", "cancelled", "Application deletion requested")
	}
	var encrypted []byte
	if e = c.Store.Pool.QueryRow(ctx, "SELECT snapshot FROM deployments WHERE id=$1", id).Scan(&encrypted); e != nil {
		return e
	}
	raw, e := c.Store.Vault.Open(encrypted, "deployment:"+id)
	if e != nil {
		return e
	}
	var snapshot DeploymentSnapshot
	if e = json.Unmarshal(raw, &snapshot); e != nil {
		return e
	}
	if currentSpec.PreviewOf != "" && d.RollbackID == "" && (snapshot.Ref != currentSpec.PreviewSHA || snapshot.Ref != currentSpec.ApprovedSHA) {
		return c.Store.Stage(ctx, id, "failed", "cancelled", "Preview commit was superseded or its approval was revoked")
	}
	log := &redactor{write: func(line string) { c.Store.Event(ctx, id, line) }}
	for _, v := range snapshot.Env {
		log.values = append(log.values, v)
	}
	for _, v := range snapshot.BuildSecrets {
		log.values = append(log.values, v)
	}
	defer log.Flush()
	if snapshot.ComposeSource != "" {
		log.values = append(log.values, model.ComposeRedactions(snapshot.ComposeSource)...)
	}
	client, _, e := c.connect(ctx, snapshot.App.ServerID)
	if e != nil {
		state, phase := "failed", "connect"
		if interrupted(e) {
			state, phase = "queued", "reconcile"
		}
		updateCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		_ = c.Store.Stage(updateCtx, id, state, phase, e.Error())
		return e
	}
	defer client.Close()
	engine := &deploy.Engine{Remote: client, Log: log, Dial: client.DialContext, PrepareNetworks: c.prepareNetworks, ValidateConfig: c.validateRenderedNetworks}
	old, oldErr := c.Store.Active(ctx, d.AppID)
	if oldErr == nil && old.App.Source == "compose" {
		log.values = append(log.values, model.ComposeRedactions(old.Compose)...)
	}
	r := model.Release{ID: id, DeploymentID: id, AppID: d.AppID, TeamID: snapshot.Resource.TeamID, ServerID: snapshot.App.ServerID, App: snapshot.App, Env: snapshot.Env, BuildSecrets: snapshot.BuildSecrets, Routes: snapshot.Routes, Directory: remote.Root + "/releases/" + id, CreatedAt: time.Now()}
	changed := false
	defer func() {
		if result == nil {
			return
		}
		if interrupted(result) {
			reconcileCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
			defer cancel()
			_ = c.Store.Stage(reconcileCtx, id, "queued", "reconcile", "Connection interrupted; reconciling the prepared release on retry")
			return
		}
		log.emit("Deployment failed: " + result.Error())
		log.emit("Deployment failed; checking previous release")
		state := "failed"
		recoveryCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Minute)
		defer stop()
		if oldErr == nil && changed {
			recoveryClient, _, ce := c.connect(recoveryCtx, old.ServerID)
			if ce == nil {
				defer recoveryClient.Close()
				recovery := &deploy.Engine{Remote: recoveryClient, Log: log, Dial: recoveryClient.DialContext, PrepareNetworks: c.prepareNetworks, ValidateConfig: c.validateRenderedNetworks}
				ce = recovery.Start(recoveryCtx, &old)
				if ce == nil {
					ce = recovery.Healthy(recoveryCtx, old)
				}
				if ce == nil {
					ce = c.syncProxy(recoveryCtx, old.ServerID, &old)
				}
				if ce == nil {
					ce = c.Store.UpdateRuntime(recoveryCtx, old)
				}
			}
			if ce != nil {
				state = "recovery_failed"
				log.emit("Previous release recovery failed: " + ce.Error())
			} else {
				log.emit("Previous release restored")
			}
		}
		if r.App.Engine == "dockerfile" && changed {
			_ = engine.Remove(recoveryCtx, r, false)
		}
		msg := result.Error()
		for _, secret := range log.values {
			if secret != "" {
				msg = strings.ReplaceAll(msg, secret, "[redacted]")
			}
		}
		// The worker also logs returned errors. Keep remote stderr diagnostics
		// subject to the same secret redaction as stored status and SSE events.
		result = errors.New(msg)
		_ = c.Store.Stage(recoveryCtx, id, state, "failed", msg)
		_ = c.Store.Enqueue(recoveryCtx, "prune", d.AppID, "prune-failed:"+id, nil)
		_ = c.Emit(recoveryCtx, "deployment."+state, snapshot.Resource.TeamID, d.AppID, map[string]string{"deploymentId": id, "error": msg})
	}()
	prepared, preparedErr := c.Store.Release(ctx, id)
	if preparedErr == nil {
		r = prepared
		log.emit("Resuming the prepared release using its immutable image snapshot")
	} else if !errors.Is(preparedErr, pgx.ErrNoRows) {
		return preparedErr
	} else if d.RollbackID != "" {
		previous, err := c.Store.Release(ctx, d.RollbackID)
		if err != nil {
			return err
		}
		if previous.AppID != d.AppID {
			return errors.New("rollback release belongs to another application")
		}
		r = previous
		r.ID = id
		r.DeploymentID = id
		r.Directory = remote.Root + "/releases/" + id
		if e = client.Run(ctx, remote.Command("mkdir", "-p", r.Directory), nil, log); e != nil {
			return e
		}
		log.emit("Restoring retained images and configuration; application data stays in place")
	} else {
		_ = c.Store.Stage(ctx, id, "building", "source", "")
		if r.App.Source == "compose" {
			if err := engine.TransferCompose(ctx, &r, snapshot.ComposeSource); err != nil {
				return err
			}
			_, _ = c.Store.Pool.Exec(ctx, "UPDATE deployments SET commit_sha=$2 WHERE id=$1", id, r.Commit)
			log.emit("Using the saved Compose document snapshot")
		} else {
			gitResource, err := c.Store.Resource(ctx, snapshot.App.GitID)
			if err != nil {
				return err
			}
			gitConfig, err := model.Decode[model.Git](gitResource)
			if err != nil {
				return err
			}
			secrets, err := c.Store.Secrets(gitResource)
			if err != nil {
				return err
			}
			for _, v := range secrets {
				log.values = append(log.values, v)
			}
			client, err := gitauth.New(c.Store, "").Client(ctx, gitResource)
			if err != nil {
				return err
			}
			var git providers.GitProvider = client
			if c.GitFactory != nil {
				git = c.GitFactory(gitConfig, secrets)
			}
			workspace, err := os.MkdirTemp(c.DataDir, "source-")
			if err != nil {
				return err
			}
			defer os.RemoveAll(workspace)
			if model.ValidSHA(d.Commit) {
				snapshot.Ref = d.Commit
			}
			log.emit("Fetching source at " + snapshot.Ref)
			r.Commit, err = git.Checkout(ctx, r.App.Repository, snapshot.Ref, workspace)
			if err != nil {
				return err
			}
			if model.ValidSHA(snapshot.Ref) && !strings.EqualFold(snapshot.Ref, r.Commit) {
				return errors.New("fetched commit does not match requested commit")
			}
			_, _ = c.Store.Pool.Exec(ctx, "UPDATE deployments SET commit_sha=$2 WHERE id=$1", id, r.Commit)
			if err = engine.Transfer(ctx, r, func(w io.Writer) error { return providers.Archive(ctx, workspace, w) }); err != nil {
				return err
			}
		}
		password := snapshot.RegistryPassword
		if password != "" {
			log.values = append(log.values, password)
		}
		_ = c.Store.Stage(ctx, id, "building", "build", "")
		if e = engine.Build(ctx, &r, r.App.Registry, r.App.RegistryUser, password); e != nil {
			return e
		}
	}
	if r.App.Source == "compose" {
		log.values = append(log.values, model.ComposeRedactions(r.Compose)...)
	}
	// Freeze exact image/configuration identities before any container mutation.
	// A resumed job starts this same release instead of rebuilding mutable input.
	if e = c.Store.SaveRelease(ctx, r); e != nil {
		return e
	}
	if e = c.preflightNetworks(ctx, r); e != nil {
		return e
	}
	if RequiresRecreate(r.App) && oldErr == nil {
		changed = true
		if e = engine.Remove(ctx, old, false); e != nil {
			return e
		}
	}
	_ = c.Store.Stage(ctx, id, "deploying", "start", "")
	changed = true
	if e = engine.Start(ctx, &r); e != nil {
		return e
	}
	_ = c.Store.Stage(ctx, id, "deploying", "readiness", "")
	if e = engine.Healthy(ctx, r); e != nil {
		return e
	}
	if e = c.Store.SaveRelease(ctx, r); e != nil {
		return e
	}
	_ = c.Store.Stage(ctx, id, "deploying", "routing", "")
	if e = c.syncProxy(ctx, r.ServerID, &r); e != nil {
		return e
	}
	if e = c.Store.Activate(ctx, r); e != nil {
		return e
	}
	if oldErr == nil && old.App.Engine == "dockerfile" && !RequiresRecreate(r.App) {
		_ = c.Store.Enqueue(ctx, "drain", old.AppID, "drain:"+old.ID, map[string]string{"releaseId": old.ID})
		_, _ = c.Store.Pool.Exec(ctx, "UPDATE jobs SET available_at=now()+interval '60 seconds' WHERE dedupe=$1", "drain:"+old.ID)
	}
	log.emit("Release is healthy and active")
	_ = c.Store.Enqueue(ctx, "prune", r.AppID, "prune:"+r.ID, nil)
	_ = c.Emit(ctx, "deployment.healthy", snapshot.Resource.TeamID, d.AppID, map[string]string{"deploymentId": id, "commit": r.Commit})
	return nil
}
func (c *Controller) drain(ctx context.Context, id string) error {
	r, e := c.Store.Release(ctx, id)
	if e != nil {
		return e
	}
	active, e := c.Store.Active(ctx, r.AppID)
	if e == nil && active.ID == id {
		return nil
	}
	client, _, e := c.connect(ctx, r.ServerID)
	if e != nil {
		return e
	}
	defer client.Close()
	engine := deploy.Engine{Remote: client, Log: io.Discard}
	return engine.Action(ctx, r, "stop")
}
func (c *Controller) scheduler(ctx context.Context) {
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case t := <-tick.C:
			if c.Store.Maintenance(ctx) {
				continue
			}
			servers, e := c.Store.Resources(ctx, "server")
			if e == nil {
				for _, server := range servers {
					_ = c.Store.Enqueue(ctx, "metrics", server.ID, fmt.Sprintf("metrics:%s:%d", server.ID, t.Unix()/30), nil)
				}
			}
			if t.Minute()%5 == 0 {
				_ = c.Store.Retention(ctx)
				rows, e := c.Store.Pool.Query(ctx, "SELECT route_id FROM domain_state WHERE expires_at<now()+interval '30 days' OR dns_state='pending' OR propagation_state='pending' OR (certificate_state<>'off' AND certificate_ca<>$1)", c.certificateAuthority())
				if e == nil {
					ids := []string{}
					for rows.Next() {
						var id string
						if rows.Scan(&id) == nil {
							ids = append(ids, id)
						}
					}
					rows.Close()
					for _, id := range ids {
						_ = c.Store.Enqueue(ctx, "domain", id, fmt.Sprintf("renew:%s:%d", id, t.Unix()/300), nil)
					}
				}
			}
		}
	}
}
