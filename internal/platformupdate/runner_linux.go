package platformupdate

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"shipyard/internal/backup"
	"shipyard/internal/db"
	"shipyard/internal/proxy"
	"shipyard/internal/release"

	"shipyard/internal/secure"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type Runner struct {
	Backup      func(context.Context, string, map[string][]byte) ([]byte, error)
	Store       *db.Store
	DatabaseURL string
	DataDir     string
	InstallDir  string
	JournalDir  string
	Catalog     release.Catalog
	Command     func(context.Context, ...string) ([]byte, error)
	Verify      func(context.Context, release.Installation) error
	Pause       func(context.Context, time.Duration) error
}

func command(ctx context.Context, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, args[0], args[1:]...)
	out, e := cmd.CombinedOutput()
	if e != nil {
		return nil, fmt.Errorf("installation command failed (%s): %w", args[0], e)
	}
	return out, nil
}
func writeAtomic(path string, b []byte, mode os.FileMode) error {
	f, e := os.OpenFile(path+".next", os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if e != nil {
		return e
	}
	if e = f.Chmod(mode); e == nil {
		_, e = f.Write(b)
	}
	if e == nil {
		e = f.Sync()
	}
	closeErr := f.Close()
	if e != nil {
		return e
	}
	if closeErr != nil {
		return closeErr
	}
	if e = os.Rename(path+".next", path); e != nil {
		return e
	}
	d, e := os.Open(filepath.Dir(path))
	if e != nil {
		return e
	}
	defer d.Close()
	return d.Sync()
}
func (r *Runner) pause(ctx context.Context, d time.Duration) error {
	if r.Pause != nil {
		return r.Pause(ctx, d)
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(d):
		return nil
	}
}
func (r *Runner) Run(ctx context.Context, id string) (result error) {
	if r.Command == nil {
		r.Command = command
	}
	if r.InstallDir == "" {
		r.InstallDir = "/opt/shipyard"
	}
	if r.JournalDir == "" {
		r.JournalDir = JournalRoot
	}
	if r.DataDir == "" {
		r.DataDir = "/data"
	}
	if _, e := BackupPath(id); e != nil {
		return e
	}
	if e := os.MkdirAll(r.JournalDir, 0700); e != nil {
		return e
	}
	if e := os.Chmod(r.JournalDir, 0700); e != nil {
		return e
	}
	dir := filepath.Join(r.JournalDir, id)
	if e := os.MkdirAll(dir, 0700); e != nil {
		return e
	}
	lock, e := os.OpenFile(filepath.Join(dir, "lock"), os.O_CREATE|os.O_RDWR, 0600)
	if e != nil {
		return e
	}
	defer lock.Close()
	if e = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); e != nil {
		return errors.New("updater is already running")
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
	service := &Service{Store: r.Store}
	o, e := service.ReadOperation(ctx)
	if e != nil {
		return e
	}
	if o.ID != id {
		return errors.New("operation was replaced or restored; refusing to execute")
	}
	journal := filepath.Join(dir, "operation.json")
	if raw, e := os.ReadFile(journal); e == nil {
		var persisted Operation
		if json.Unmarshal(raw, &persisted) != nil || persisted.ID != id {
			return errors.New("invalid updater journal")
		}
		o = persisted
	}
	if !o.Active() {
		return Save(ctx, r.Store, o)
	}
	var installed release.Installation
	raw, e := os.ReadFile(filepath.Join(r.InstallDir, "install.json"))
	if e != nil {
		return e
	}
	if e = json.Unmarshal(raw, &installed); e != nil {
		return e
	}
	if e = installed.Validate(); e != nil {
		return e
	}
	checkpoint := func(state string) error {
		o.State = state
		o.UpdatedAt = time.Now()
		raw, e := json.Marshal(o)
		if e != nil {
			return e
		}
		if e = writeAtomic(journal, raw, 0600); e != nil {
			return e
		}
		return Save(ctx, r.Store, o)
	}
	applying := o.State == "applying" || o.State == "verifying" || o.State == "recovering"
	defer func() {
		if result == nil {
			return
		}
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		o.Error = result.Error()
		o.Cipher = nil
		if applying {
			_ = checkpoint("recovering")
			if e := r.recover(cleanup, dir, o.Plan); e != nil {
				o.Error += "; recovery: " + e.Error()
				_ = checkpoint("recovery_required")
				_ = r.maintenance(cleanup, true)
			} else {
				_ = r.maintenance(cleanup, o.PreviousMaintenance)
				_ = checkpoint("rolled_back")
			}
		} else {
			if o.MaintenanceEntered {
				_ = r.maintenance(cleanup, o.PreviousMaintenance)
			}
			_ = checkpoint("failed")
		}
		_ = r.Store.Audit(cleanup, o.Actor, "platform.version-change."+o.State, o.ID, "", map[string]string{"target": o.Plan.Target.Version, "error": o.Error})
	}()
	if !applying && o.State != "backed_up" {
		if e = checkpoint("preflight"); e != nil {
			return e
		}
		m, e := r.Catalog.Fetch(ctx, o.Plan.Target.Version)
		if e != nil {
			return e
		}
		approved := o.Plan.Target
		approved.Notes = ""
		if !reflect.DeepEqual(m, approved) {
			return errors.New("published release changed after approval")
		}
		for _, name := range []string{"compose.host.yaml", "install.sh"} {
			b, e := r.Catalog.Asset(ctx, m.Version, name)
			if e != nil {
				return e
			}
			if release.Hash(b) != m.Assets[name] {
				return errors.New("installation artifact checksum mismatch")
			}
			if e = writeAtomic(filepath.Join(dir, "target-"+name), b, 0600); e != nil {
				return e
			}
		}
		raw, _ := json.Marshal(m)
		if e = writeAtomic(filepath.Join(dir, "target-release.json"), raw, 0600); e != nil {
			return e
		}
		for _, image := range []string{m.CoreImage, m.ExecutorImage} {
			if _, e = r.Command(ctx, "docker", "pull", image); e != nil {
				return e
			}
		}
		for _, name := range []string{".env", "compose.host.yaml", "install.json", "release.json"} {
			path := filepath.Join(r.InstallDir, name)
			st, e := os.Lstat(path)
			if e != nil || !st.Mode().IsRegular() {
				return errors.New("installation files must be regular files")
			}
			b, e := os.ReadFile(path)
			if e != nil {
				return e
			}
			if e = writeAtomic(filepath.Join(dir, "old-"+strings.TrimPrefix(name, ".")), b, 0600); e != nil {
				return e
			}
		}
		info, e := r.Command(ctx, "docker", "info", "--format", "{{.ID}}")
		if e != nil || strings.TrimSpace(string(info)) != installed.DaemonID {
			return errors.New("Docker identity changed")
		}
		engine, e := r.Command(ctx, "docker", "version", "--format", "{{.Server.Version}}")
		if e != nil {
			return e
		}
		compose, e := r.Command(ctx, "docker", "compose", "version", "--short")
		if e != nil {
			return e
		}
		var postgres int
		if e = r.Store.Pool.QueryRow(ctx, "SELECT current_setting('server_version_num')::integer / 10000").Scan(&postgres); e != nil {
			return e
		}
		if e = release.CheckRuntime(strings.TrimSpace(string(engine)), string(compose), postgres, m); e != nil {
			return e
		}
		var stat syscall.Statfs_t
		if e = syscall.Statfs(dir, &stat); e != nil {
			return e
		}
		var databaseSize int64
		if e = r.Store.Pool.QueryRow(ctx, "SELECT pg_database_size(current_database())").Scan(&databaseSize); e != nil {
			return e
		}
		if uint64(stat.Bavail)*uint64(stat.Bsize) < uint64(databaseSize*2)+(512<<20) {
			return errors.New("insufficient space for backup and version-change files")
		}
		if !o.MaintenanceEntered {
			o.PreviousMaintenance = r.Store.Maintenance(ctx)
			o.MaintenanceEntered = true
			o.DrainDeadline = time.Now().Add(15 * time.Minute)
			if e = checkpoint("waiting"); e != nil {
				return e
			}
		}
		if e = r.maintenance(ctx, true); e != nil {
			return e
		}
		if e = checkpoint("waiting"); e != nil {
			return e
		}
		deadline := o.DrainDeadline
		if deadline.IsZero() {
			deadline = time.Now().Add(15 * time.Minute)
		}
		for {
			var count int
			if e = r.Store.Pool.QueryRow(ctx, "SELECT (SELECT count(*) FROM jobs WHERE state='running')+(SELECT count(*) FROM job_runs WHERE state IN ('queued','running','retry_wait','cancelling') OR cleanup_pending)").Scan(&count); e != nil {
				return e
			}
			if count == 0 {
				break
			}
			if time.Now().After(deadline) {
				return errors.New("running jobs did not finish within 15 minutes; retry later")
			}
			if e = r.pause(ctx, time.Second); e != nil {
				return e
			}
		}
		args, e := r.migrationArgs(dir, o.Plan, "plan", o.Plan.Target.Schema, false)
		if e != nil {
			return e
		}
		migrationRaw, e := r.Command(ctx, args...)
		_ = os.Remove(filepath.Join(dir, "migration.env"))
		if e != nil {
			return e
		}
		var actual db.MigrationStatus
		if e = json.Unmarshal(migrationRaw, &actual); e != nil {
			return e
		}
		if actual.Current != o.Plan.Migrations.Current || actual.Target != o.Plan.Migrations.Target || len(actual.Steps) != len(o.Plan.Migrations.Steps) {
			return errors.New("migration path changed after approval")
		}
		for n, step := range actual.Steps {
			if step != o.Plan.Migrations.Steps[n] {
				return errors.New("migration checksum or impact changed after approval")
			}
		}
		pass, e := r.Store.Vault.Open(o.Cipher, "platform-update:"+o.ID)
		if e != nil {
			return e
		}
		defer func() {
			for n := range pass {
				pass[n] = 0
			}
		}()
		extras := map[string][]byte{}
		for _, name := range []string{".env", "compose.host.yaml", "install.json", "release.json"} {
			extras[name], e = os.ReadFile(filepath.Join(r.InstallDir, name))
			if e != nil {
				return e
			}
		}
		var archive []byte
		if r.Backup != nil {
			archive, e = r.Backup(ctx, string(pass), extras)
		} else {
			archive, e = backup.ExportWithFiles(ctx, r.Store, r.DatabaseURL, r.DataDir, string(pass), extras)
		}
		for i := range pass {
			pass[i] = 0
		}
		if e != nil {
			return e
		}
		o.Backup = filepath.Join(dir, "backup.sybackup")
		o.BackupHash = release.Hash(archive)
		if e = writeAtomic(o.Backup, archive, 0600); e != nil {
			return e
		}
		o.Cipher = nil
		if e = checkpoint("backed_up"); e != nil {
			return e
		}
	}
	if o.State == "recovering" {
		if e = r.recover(ctx, dir, o.Plan); e != nil {
			return e
		}
		if e = r.maintenance(ctx, o.PreviousMaintenance); e != nil {
			return e
		}
		return checkpoint("rolled_back")
	}
	if e = checkpoint("applying"); e != nil {
		return e
	}
	applying = true
	if _, e = r.compose(ctx, "stop", "shipyard"); e != nil {
		return e
	}
	if e = r.migrate(ctx, dir, o.Plan, o.Plan.Target.Schema, o.Plan.Destructive); e != nil {
		return e
	}
	installed.Revision = o.Plan.Revision
	if e = r.installFiles(dir, o.Plan.Target, installed); e != nil {
		return e
	}
	if _, e = r.compose(ctx, "up", "-d", "--no-deps", "--force-recreate", "host-executor", "shipyard"); e != nil {
		return e
	}
	if e = checkpoint("verifying"); e != nil {
		return e
	}
	installed.Release = o.Plan.Target
	installed.Revision = o.Plan.Revision + 1
	if e = r.verify(ctx, installed); e != nil {
		return e
	}
	if e = r.maintenance(ctx, o.PreviousMaintenance); e != nil {
		return e
	}
	if e = checkpoint("succeeded"); e != nil {
		return e
	}
	_ = r.Store.Audit(ctx, o.Actor, "platform.version-change.succeeded", o.ID, "", map[string]string{"target": o.Plan.Target.Version})
	return nil
}
func (r *Runner) maintenance(ctx context.Context, value bool) error {
	_, e := r.Store.Pool.Exec(ctx, "UPDATE settings SET value=$1 WHERE key='maintenance'", fmt.Sprintf("%t", value))
	return e
}
func (r *Runner) compose(ctx context.Context, args ...string) ([]byte, error) {
	base := []string{"docker", "compose", "--project-name", "shipyard", "--env-file", filepath.Join(r.InstallDir, ".env"), "-f", filepath.Join(r.InstallDir, "compose.host.yaml")}
	return r.Command(ctx, append(base, args...)...)
}
func (r *Runner) migrationImage(p Plan) string {
	if p.Target.Schema >= p.Current.Schema {
		return p.Target.CoreImage
	}
	return p.Current.CoreImage
}
func (r *Runner) migrationArgs(dir string, p Plan, action string, target int, allow bool) ([]string, error) {
	envfile := filepath.Join(dir, "migration.env")
	if e := writeAtomic(envfile, []byte("DATABASE_URL="+r.DatabaseURL+"\nSHIPYARD_MASTER_KEY="+r.Store.Vault.Key()+"\nSENTRY_DSN=\n"), 0600); e != nil {
		return nil, e
	}
	args := []string{"docker", "run", "--rm", "--label", "shipyard.role=migration", "--network", "host", "--env-file", envfile, r.migrationImage(p), "migrate", action, strconv.Itoa(target)}
	if allow {
		args = append(args, "--allow-data-loss")
	}
	return args, nil
}
func (r *Runner) migrate(ctx context.Context, dir string, p Plan, target int, allow bool) error {
	args, e := r.migrationArgs(dir, p, "apply", target, allow)
	if e != nil {
		return e
	}
	defer os.Remove(filepath.Join(dir, "migration.env"))
	_, e = r.Command(ctx, args...)
	return e
}
func (r *Runner) installFiles(dir string, target release.Manifest, installed release.Installation) error {
	env, e := os.ReadFile(filepath.Join(dir, "old-env"))
	if e != nil {
		return e
	}
	lines := strings.Split(string(env), "\n")
	for i, line := range lines {
		if strings.HasPrefix(line, "SHIPYARD_IMAGE=") {
			lines[i] = "SHIPYARD_IMAGE=" + target.CoreImage
		}
		if strings.HasPrefix(line, "SHIPYARD_EXECUTOR_IMAGE=") {
			lines[i] = "SHIPYARD_EXECUTOR_IMAGE=" + target.ExecutorImage
		}
	}
	if e = writeAtomic(filepath.Join(r.InstallDir, ".env"), []byte(strings.Join(lines, "\n")), 0600); e != nil {
		return e
	}
	compose, e := os.ReadFile(filepath.Join(dir, "target-compose.host.yaml"))
	if e != nil {
		return e
	}
	if e = writeAtomic(filepath.Join(r.InstallDir, "compose.host.yaml"), compose, 0600); e != nil {
		return e
	}
	manifest, e := os.ReadFile(filepath.Join(dir, "target-release.json"))
	if e != nil {
		return e
	}
	if e = writeAtomic(filepath.Join(r.InstallDir, "release.json"), manifest, 0600); e != nil {
		return e
	}
	installed.Release = target
	installed.Revision++
	raw, _ := json.MarshalIndent(installed, "", "  ")
	if e = writeAtomic(filepath.Join(r.InstallDir, "install.json"), raw, 0640); e != nil {
		return e
	}
	return os.Chown(filepath.Join(r.InstallDir, "install.json"), 0, 10001)
}
func (r *Runner) recover(ctx context.Context, dir string, p Plan) error {
	args, e := r.migrationArgs(dir, p, "plan", p.Current.Schema, false)
	if e != nil {
		return e
	}
	defer os.Remove(filepath.Join(dir, "migration.env"))
	raw, e := r.Command(ctx, args...)
	if e != nil {
		return errors.New("cannot verify database recovery path")
	}
	var plan db.MigrationStatus
	if e = json.Unmarshal(raw, &plan); e != nil {
		return e
	}
	for _, step := range plan.Steps {
		if step.Classification != "non-destructive" {
			return errors.New("database recovery needs explicit data-loss approval or backup restoration")
		}
	}
	if _, e = r.compose(ctx, "stop", "shipyard"); e != nil {
		return e
	}
	if e = r.migrate(ctx, dir, p, p.Current.Schema, false); e != nil {
		return e
	}
	for _, name := range []string{".env", "compose.host.yaml", "install.json", "release.json"} {
		b, e := os.ReadFile(filepath.Join(dir, "old-"+strings.TrimPrefix(name, ".")))
		if e != nil {
			return e
		}
		mode := os.FileMode(0600)
		if name == "install.json" {
			mode = 0640
		}
		if e = writeAtomic(filepath.Join(r.InstallDir, name), b, mode); e != nil {
			return e
		}
	}
	_ = os.Chown(filepath.Join(r.InstallDir, "install.json"), 0, 10001)
	if _, e = r.compose(ctx, "up", "-d", "--no-deps", "--force-recreate", "host-executor", "shipyard"); e != nil {
		return e
	}
	var installed release.Installation
	b, e := os.ReadFile(filepath.Join(r.InstallDir, "install.json"))
	if e != nil {
		return e
	}
	if e = json.Unmarshal(b, &installed); e != nil {
		return e
	}
	return r.verify(ctx, installed)
}
func (r *Runner) verify(ctx context.Context, i release.Installation) error {
	if r.Verify != nil {
		return r.Verify(ctx, i)
	}
	var rawBindings []byte
	var settings struct {
		Bindings proxy.Bindings `json:"bindings"`
	}
	e := r.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key='haproxy:shipyard-local'").Scan(&rawBindings)
	if e != nil && !errors.Is(e, pgx.ErrNoRows) {
		return e
	}
	if e == nil {
		if e = json.Unmarshal(rawBindings, &settings); e != nil {
			return e
		}
	}
	deadline := time.Now().Add(3 * time.Minute)
	for time.Now().Before(deadline) {
		ready := true
		for _, name := range []string{i.ControlContainer, i.ExecutorContainer} {
			raw, e := r.Command(ctx, "docker", "exec", name, func() string {
				if name == i.ExecutorContainer {
					return "shipyard-executor"
				}
				return "shipyard"
			}(), "version")
			var info struct{ Version string }
			if e != nil || json.Unmarshal(raw, &info) != nil || info.Version != i.Release.Version {
				ready = false
			}
		}
		var address, gateway string
		var system []byte
		if e := r.Store.Pool.QueryRow(ctx, "SELECT data FROM resources WHERE id='shipyard-dashboard'").Scan(&system); e != nil {
			ready = false
		} else {
			var target struct{ Address, Gateway string }
			json.Unmarshal(system, &target)
			address = target.Address
			gateway = target.Gateway
		}
		if net.ParseIP(address) == nil || net.ParseIP(gateway) == nil {
			ready = false
		}
		if ready {
			inspect, e := r.Command(ctx, "docker", "inspect", i.ControlContainer)
			var items []struct {
				NetworkSettings struct {
					Networks map[string]struct{ IPAddress string }
				}
			}
			if e != nil || json.Unmarshal(inspect, &items) != nil || len(items) != 1 {
				ready = false
			} else {
				attached := false
				for _, n := range items[0].NetworkSettings.Networks {
					attached = attached || n.IPAddress == address
				}
				ready = attached
			}
		}
		if ready {
			var raw []byte
			if r.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key='dashboard-access'").Scan(&raw) == nil {
				var access struct{ ActiveDomain string }
				json.Unmarshal(raw, &access)
				if access.ActiveDomain != "" {
					tr := &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}, DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
						var last error
						for _, address := range proxy.HTTPSProbeAddresses(settings.Bindings) {
							conn, e := (&net.Dialer{Timeout: time.Second}).DialContext(ctx, "tcp", address)
							if e == nil {
								return conn, nil
							}
							last = e
						}
						return nil, last
					}}
					client := &http.Client{Transport: tr, Timeout: 5 * time.Second}
					res, e := client.Get("https://" + access.ActiveDomain + "/api/v1/version")
					if e == nil {
						var v struct{ Version string }
						json.NewDecoder(res.Body).Decode(&v)
						res.Body.Close()
						tr.CloseIdleConnections()
						if res.StatusCode == 200 && v.Version == i.Release.Version {
							return nil
						}
					} else {
						tr.CloseIdleConnections()
					}
				}
			}
		}
		if e := r.pause(ctx, time.Second); e != nil {
			return e
		}
	}
	return errors.New("replacement version, ingress attachment or dashboard HTTPS did not become ready")
}
func RunUpgrade(ctx context.Context, id string) error {
	url := os.Getenv("SHIPYARD_UPDATE_DATABASE_URL")
	if url == "" {
		return errors.New("updater database configuration is missing")
	}
	pool, e := pgxpool.New(ctx, url)
	if e != nil {
		return e
	}
	defer pool.Close()
	vault, e := secure.New(os.Getenv("SHIPYARD_MASTER_KEY"))
	if e != nil {
		return e
	}
	runner := &Runner{Store: &db.Store{Pool: pool, Vault: vault}, DatabaseURL: url}
	return runner.Run(ctx, id)
}
