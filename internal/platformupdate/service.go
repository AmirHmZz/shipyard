package platformupdate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"net"
	"net/url"
	"os"
	"shipyard/internal/buildinfo"
	"shipyard/internal/db"
	"shipyard/internal/release"
	"shipyard/internal/remote"
	"strings"
	"time"
)

const OperationKey = "platform-update"
const JournalRoot = "/var/lib/shipyard/upgrades"

type Plan struct {
	ID          string             `json:"id"`
	Actor       string             `json:"-"`
	Revision    int                `json:"revision"`
	Current     release.Manifest   `json:"current"`
	Target      release.Manifest   `json:"target"`
	Migrations  db.MigrationStatus `json:"migrations"`
	Destructive bool               `json:"destructive"`
	Expires     time.Time          `json:"expires"`
}
type Operation struct {
	ID                  string    `json:"id"`
	Actor               string    `json:"actor"`
	State               string    `json:"state"`
	Error               string    `json:"error"`
	Plan                Plan      `json:"plan"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
	Backup              string    `json:"backup,omitempty"`
	BackupHash          string    `json:"backupHash,omitempty"`
	PreviousMaintenance bool      `json:"previousMaintenance"`
	MaintenanceEntered  bool      `json:"maintenanceEntered"`
	DrainDeadline       time.Time `json:"drainDeadline,omitempty"`
	Cipher              []byte    `json:"cipher,omitempty"`
}

func (o Operation) Active() bool {
	return o.ID != "" && o.State != "succeeded" && o.State != "rolled_back" && o.State != "failed" && o.State != "recovery_required"
}
func (o Operation) Public() Operation { o.Cipher = nil; o.Plan.Actor = ""; return o }

type Status struct {
	Enabled      bool                  `json:"enabled"`
	Reason       string                `json:"reason,omitempty"`
	Version      buildinfo.Info        `json:"version"`
	Installation *release.Installation `json:"installation,omitempty"`
	Releases     []release.Manifest    `json:"releases"`
	Operation    *Operation            `json:"operation,omitempty"`
}
type Service struct {
	Store       *db.Store
	Local       *remote.Docker
	Self        string
	DatabaseURL string
	InstallPath string
	Catalog     release.Catalog
}

func (s *Service) Installation() (release.Installation, error) {
	var i release.Installation
	path := s.InstallPath
	if path == "" {
		path = "/installation/install.json"
	}
	b, e := os.ReadFile(path)
	if e != nil {
		return i, errors.New("System updates require a native installation managed by the release installer")
	}
	if e = json.Unmarshal(b, &i); e != nil {
		return i, e
	}
	if e = i.Validate(); e != nil {
		return i, e
	}
	if i.Release.Version != buildinfo.Version {
		return i, errors.New("installed version differs from the running binary")
	}
	return i, nil
}
func (s *Service) ReadOperation(ctx context.Context) (Operation, error) {
	return s.Operation(ctx, "")
}
func (s *Service) Operation(ctx context.Context, id string) (Operation, error) {
	var o Operation
	var raw []byte
	key := OperationKey
	if id != "" {
		if _, e := uuid.Parse(id); e != nil {
			return o, e
		}
		key += ":" + id
	}
	e := s.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", key).Scan(&raw)
	if errors.Is(e, pgx.ErrNoRows) {
		return o, nil
	}
	if e == nil {
		e = json.Unmarshal(raw, &o)
	}
	return o, e
}
func (s *Service) Status(ctx context.Context) (Status, error) {
	out := Status{Version: buildinfo.Current(), Releases: []release.Manifest{}}
	i, e := s.Installation()
	if e != nil {
		out.Reason = e.Error()
		return out, nil
	}
	out.Enabled = s.Local != nil
	out.Installation = &i
	var raw []byte
	if e = s.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key='release-catalog'").Scan(&raw); e == nil {
		if e = json.Unmarshal(raw, &out.Releases); e != nil {
			return out, e
		}
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return out, e
	}
	o, e := s.ReadOperation(ctx)
	if e != nil {
		return out, e
	}
	if o.ID != "" {
		v := o.Public()
		out.Operation = &v
	}
	return out, nil
}
func (s *Service) Check(ctx context.Context) (Status, error) {
	if _, e := s.Installation(); e != nil {
		return Status{}, e
	}
	items, e := s.Catalog.List(ctx)
	if e != nil {
		return Status{}, e
	}
	raw, _ := json.Marshal(items)
	_, e = s.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES('release-catalog',$1) ON CONFLICT(key) DO UPDATE SET value=$1", raw)
	if e != nil {
		return Status{}, e
	}
	return s.Status(ctx)
}
func (s *Service) Prepare(ctx context.Context, target, actor string) (Plan, error) {
	var p Plan
	i, e := s.Installation()
	if e != nil {
		return p, e
	}
	if s.Local == nil {
		return p, errors.New("local Docker is disabled")
	}
	id, e := s.Local.Identity(ctx)
	if e != nil || id != i.DaemonID {
		return p, errors.New("Docker daemon identity differs from the installation")
	}
	status, e := s.Status(ctx)
	if e != nil {
		return p, e
	}
	if status.Operation != nil && (status.Operation.Active() || status.Operation.State == "recovery_required") {
		return p, errors.New("resolve the active version change first")
	}
	var m release.Manifest
	for _, candidate := range status.Releases {
		if candidate.Version == target {
			m = candidate
		}
	}
	if e = m.Validate(); e != nil {
		return p, errors.New("select a published version from the checked release catalog")
	}
	if !(m.Previous == i.Release.Version || i.Release.Previous == m.Version) {
		return p, errors.New("only consecutive tested release steps are supported")
	}
	state, e := db.MigrationState(ctx, s.Store.Pool)
	if e != nil {
		return p, e
	}
	if state.Current != i.Release.Schema {
		return p, errors.New("installed release and database schema differ")
	}
	all := m.Migrations
	if len(i.Release.Migrations) > len(all) {
		all = i.Release.Migrations
	}
	for n := 0; n < len(m.Migrations) && n < len(i.Release.Migrations); n++ {
		a, b := m.Migrations[n], i.Release.Migrations[n]
		if a.Name != b.Name || a.Up != b.Up || a.Down != b.Down || a.UpChecksum != b.UpChecksum || a.DownChecksum != b.DownChecksum {
			return p, errors.New("published migration contents differ across releases")
		}
	}
	p = Plan{ID: uuid.NewString(), Actor: actor, Revision: i.Revision, Current: i.Release, Target: m, Expires: time.Now().Add(15 * time.Minute)}
	p.Migrations, e = db.PlanMigrations(state.Current, m.Schema, all)
	if e != nil {
		return p, e
	}
	for _, step := range p.Migrations.Steps {
		if step.Classification == "unsupported" {
			return p, errors.New("this migration direction requires manual backup restoration")
		}
		p.Destructive = p.Destructive || step.Classification == "destructive"
	}
	raw, _ := json.Marshal(struct {
		Plan
		ActorID string `json:"actorId"`
	}{p, actor})
	_, e = s.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2)", "platform-plan:"+p.ID, raw)
	return p, e
}
func (s *Service) Execute(ctx context.Context, planID, actor, passphrase, confirmation string, approved bool) (Operation, error) {
	var saved struct {
		Plan
		ActorID string `json:"actorId"`
	}
	var raw []byte
	var out Operation
	if len(passphrase) < 12 || len(passphrase) > 4096 {
		return out, errors.New("backup passphrase must contain 12 to 4096 characters")
	}
	tx, e := s.Store.Pool.Begin(ctx)
	if e != nil {
		return out, e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(73914231)"); e != nil {
		return out, e
	}
	if e = tx.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1 FOR UPDATE", "platform-plan:"+planID).Scan(&raw); e != nil {
		return out, errors.New("version-change plan is missing or already used")
	}
	if e = json.Unmarshal(raw, &saved); e != nil {
		return out, e
	}
	if saved.ActorID != actor || saved.Expires.Before(time.Now()) {
		return out, errors.New("version-change plan expired or belongs to another administrator")
	}
	i, e := s.Installation()
	if e != nil || i.Revision != saved.Revision || i.Release.Version != saved.Current.Version {
		return out, db.ErrConflict
	}
	if saved.Destructive && (!approved || confirmation != saved.Target.Version) {
		return out, errors.New("explicit data-loss approval and the exact target version are required")
	}
	var current Operation
	e = tx.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", OperationKey).Scan(&raw)
	if e != nil && !errors.Is(e, pgx.ErrNoRows) {
		return out, e
	}
	if e == nil {
		if e = json.Unmarshal(raw, &current); e != nil {
			return out, e
		}
	}
	if current.Active() || current.State == "recovery_required" {
		return out, errors.New("another version change is active or needs recovery")
	}
	out = Operation{ID: uuid.NewString(), Actor: actor, State: "queued", Plan: saved.Plan, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	out.Cipher, e = s.Store.Vault.Seal([]byte(passphrase), "platform-update:"+out.ID)
	if e != nil {
		return out, e
	}
	raw, _ = json.Marshal(out)
	if _, e = tx.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2),($3,$2) ON CONFLICT(key) DO UPDATE SET value=$2", OperationKey, raw, OperationKey+":"+out.ID); e != nil {
		return out, e
	}
	if _, e = tx.Exec(ctx, "DELETE FROM settings WHERE key=$1", "platform-plan:"+planID); e != nil {
		return out, e
	}
	if e = tx.Commit(ctx); e != nil {
		return out, e
	}
	_ = s.Store.Audit(ctx, actor, "platform.version-change.requested", out.ID, "", map[string]string{"target": out.Plan.Target.Version})
	return out.Public(), nil
}
func (s *Service) Run(ctx context.Context) {
	tick := time.NewTicker(3 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			o, e := s.ReadOperation(ctx)
			if e == nil && o.Active() {
				if e = s.launch(ctx, o); e != nil {
					if o.State == "queued" {
						o.Error = "Could not start protected updater: " + e.Error()
						o.State = "failed"
						o.Cipher = nil
						_ = Save(ctx, s.Store, o)
						_ = s.Store.Audit(ctx, o.Actor, "platform.version-change.failed", o.ID, "", map[string]string{"target": o.Plan.Target.Version, "error": o.Error})
					}
				}
			}
		}
	}
}
func Save(ctx context.Context, store *db.Store, o Operation) error {
	o.UpdatedAt = time.Now()
	raw, e := json.Marshal(o)
	if e != nil {
		return e
	}
	_, e = store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2),($3,$2) ON CONFLICT(key) DO UPDATE SET value=$2", OperationKey, raw, OperationKey+":"+o.ID)
	return e
}
func (s *Service) launch(ctx context.Context, o Operation) error {
	i, e := s.Installation()
	if e != nil {
		return e
	}
	actual, e := s.Local.Identity(ctx)
	if e != nil || actual != i.DaemonID {
		return errors.New("Docker identity check failed")
	}
	var core struct {
		Image  string
		Name   string
		Config struct{ Labels map[string]string }
		Mounts []struct{ Source, Destination, Type string }
	}
	if e = s.Local.API(ctx, "GET", "/containers/"+url.PathEscape(s.Self)+"/json", nil, &core); e != nil {
		return e
	}
	if core.Config.Labels["shipyard.role"] != "control-plane" || strings.TrimPrefix(core.Name, "/") != i.ControlContainer {
		return errors.New("control-plane installation ownership mismatch")
	}
	mountOK := false
	for _, m := range core.Mounts {
		if m.Destination == "/installation" && m.Source == i.Directory {
			mountOK = true
		}
	}
	if !mountOK {
		return errors.New("installation directory mount mismatch")
	}
	var helper struct {
		Image  string
		Config struct{ Labels map[string]string }
	}
	if e = s.Local.API(ctx, "GET", "/containers/"+i.ExecutorContainer+"/json", nil, &helper); e != nil {
		return e
	}
	if helper.Config.Labels["shipyard.role"] != "executor" {
		return errors.New("executor ownership mismatch")
	}
	for _, p := range [][2]string{{i.Release.CoreImage, core.Image}, {i.Release.ExecutorImage, helper.Image}} {
		var image struct {
			ID string `json:"Id"`
		}
		if e = s.Local.API(ctx, "GET", "/images/"+url.PathEscape(p[0])+"/json", nil, &image); e != nil {
			return e
		}
		if image.ID != p[1] {
			return errors.New("installed component digest mismatch")
		}
	}
	u, e := url.Parse(s.DatabaseURL)
	if e != nil {
		return e
	}
	var pg struct {
		Config          struct{ Labels map[string]string }
		NetworkSettings struct {
			Networks map[string]struct{ IPAddress string }
		}
	}
	if e = s.Local.API(ctx, "GET", "/containers/shipyard-postgres-1/json", nil, &pg); e != nil {
		return e
	}
	if pg.Config.Labels["com.docker.compose.project"] != i.Project || pg.Config.Labels["com.docker.compose.service"] != "postgres" {
		return errors.New("PostgreSQL installation ownership mismatch")
	}
	ip := ""
	for _, n := range pg.NetworkSettings.Networks {
		ip = n.IPAddress
		break
	}
	if net.ParseIP(ip) == nil {
		return errors.New("PostgreSQL address unavailable")
	}
	u.Host = net.JoinHostPort(ip, "5432")
	name := "shipyard-updater-" + o.ID
	var existing struct {
		ID     string `json:"Id"`
		Config struct{ Labels map[string]string }
		State  struct{ Running bool }
	}
	if e = s.Local.API(ctx, "GET", "/containers/"+name+"/json", nil, &existing); e == nil {
		if existing.Config.Labels["shipyard.operation"] != o.ID {
			return errors.New("updater container ownership mismatch")
		}
		if existing.State.Running {
			return nil
		}
		return s.Local.API(ctx, "POST", "/containers/"+name+"/start", nil, nil)
	}
	input := map[string]any{"Image": i.Release.ExecutorImage, "Entrypoint": []string{"shipyard-executor"}, "Cmd": []string{"upgrade", o.ID}, "Env": []string{"SHIPYARD_UPDATE_DATABASE_URL=" + u.String(), "SHIPYARD_MASTER_KEY=" + s.Store.Vault.Key()}, "Labels": map[string]string{"shipyard.role": "updater", "shipyard.operation": o.ID}, "HostConfig": map[string]any{"NetworkMode": "host", "PidMode": "host", "VolumesFrom": []string{strings.TrimPrefix(core.Name, "/")}, "Binds": []string{i.Directory + ":" + i.Directory, JournalRoot + ":" + JournalRoot}, "RestartPolicy": map[string]any{"Name": "on-failure", "MaximumRetryCount": 3}}}
	var created struct {
		ID string `json:"Id"`
	}
	if e = s.Local.API(ctx, "POST", "/containers/create?name="+name, input, &created); e != nil {
		return e
	}
	return s.Local.API(ctx, "POST", "/containers/"+created.ID+"/start", nil, nil)
}
func BackupPath(id string) (string, error) {
	if _, e := uuid.Parse(id); e != nil {
		return "", errors.New("invalid operation ID")
	}
	return fmt.Sprintf("%s/%s/backup.sybackup", JournalRoot, id), nil
}
