package platformupdate

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"shipyard/internal/db"
	"shipyard/internal/release"
	"strings"
	"testing"
	"time"
)

func TestRunnerBackupRecoveryAndIdempotence(t *testing.T) {
	for _, mode := range []string{"success", "health-failure", "unsafe-recovery", "pull-failure", "interrupted", "drain-cancelled", "drain-admitted", "drain-expired"} {
		t.Run(mode, func(t *testing.T) {
			s, installed, next := fixture(t)
			ctx := context.Background()
			if mode == "drain-cancelled" {
				if _, e := s.Store.Pool.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,state) VALUES('test-running-job','deploy','application','running')"); e != nil {
					t.Fatal(e)
				}
			}
			if mode == "drain-admitted" || mode == "drain-expired" {
				if _, e := s.Store.Pool.Exec(ctx, `INSERT INTO resources(id,kind,name,data)
					VALUES('test-job-app','application','Job drain fixture','{"workload":"job"}');
					INSERT INTO job_runs(id,app_id,release_id,state,trigger,policy)
					VALUES('test-drained-run','test-job-app','test-release','retry_wait','manual','{}')`); e != nil {
					t.Fatal(e)
				}
			}
			dir := filepath.Dir(s.InstallPath)
			for name, body := range map[string]string{".env": "SHIPYARD_IMAGE=" + installed.Release.CoreImage + "\nSHIPYARD_EXECUTOR_IMAGE=" + installed.Release.ExecutorImage + "\n", "compose.host.yaml": "old compose", "release.json": "old release"} {
				if e := os.WriteFile(filepath.Join(dir, name), []byte(body), 0600); e != nil {
					t.Fatal(e)
				}
			}
			assets := map[string][]byte{"compose.host.yaml": []byte("new compose"), "install.sh": []byte("installer")}
			for name, b := range assets {
				next.Assets[name] = release.Hash(b)
			}
			manifest, _ := json.Marshal(next)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				name := filepath.Base(r.URL.Path)
				switch name {
				case "release.json":
					w.Write(manifest)
				case "SHA256SUMS":
					w.Write([]byte(release.Hash(manifest) + "  release.json\n"))
				default:
					if b, ok := assets[name]; ok {
						w.Write(b)
					} else {
						http.NotFound(w, r)
					}
				}
			}))
			defer server.Close()
			raw, _ := json.Marshal([]release.Manifest{next})
			s.Store.Pool.Exec(ctx, "UPDATE settings SET value=$1 WHERE key='release-catalog'", raw)
			p, e := s.Prepare(ctx, next.Version, "admin")
			if e != nil {
				t.Fatal(e)
			}
			o, e := s.Execute(ctx, p.ID, "admin", "long-backup-passphrase", "", false)
			if e != nil {
				t.Fatal(e)
			}
			if mode == "drain-expired" {
				o.MaintenanceEntered = true
				o.DrainDeadline = time.Now().Add(-time.Second)
				if e = Save(ctx, s.Store, o); e != nil {
					t.Fatal(e)
				}
			}
			commands := []string{}
			backups := 0
			interrupted := false
			runner := &Runner{Store: s.Store, InstallDir: dir, JournalDir: t.TempDir(), DataDir: t.TempDir(), Catalog: release.Catalog{Downloads: server.URL}, Pause: func(context.Context, time.Duration) error { return context.Canceled }, Command: func(_ context.Context, args ...string) ([]byte, error) {
				cmd := strings.Join(args, " ")
				commands = append(commands, cmd)
				if strings.Contains(cmd, " version --format ") {
					return []byte("29.0.0"), nil
				}
				if strings.Contains(cmd, "compose version --short") {
					return []byte("2.40.0"), nil
				}
				if strings.Contains(cmd, " info ") {
					return []byte(installed.DaemonID), nil
				}
				if mode == "pull-failure" && strings.Contains(cmd, " pull ") {
					return nil, errors.New("registry unavailable")
				}
				if strings.Contains(cmd, "migrate plan") {
					steps := []db.MigrationStep{}
					if mode == "unsafe-recovery" && backups > 0 {
						steps = append(steps, db.MigrationStep{Classification: "destructive", Impact: "Discard data"})
					}
					return json.Marshal(db.MigrationStatus{Current: db.LatestSchema(), Target: db.LatestSchema(), Steps: steps})
				}
				return nil, nil
			}, Backup: func(_ context.Context, pass string, files map[string][]byte) ([]byte, error) {
				backups++
				if pass != "long-backup-passphrase" || len(files) != 4 {
					t.Fatal("backup did not include credentials and installation files")
				}
				return []byte("encrypted test backup"), nil
			}, Verify: func(_ context.Context, i release.Installation) error {
				if mode == "interrupted" && !interrupted {
					interrupted = true
					panic("simulated updater process interruption")
				}
				if (mode == "health-failure" || mode == "unsafe-recovery") && i.Release.Version == next.Version {
					return errors.New("new dashboard unavailable")
				}
				return nil
			}}
			if mode == "drain-admitted" {
				runner.Pause = func(ctx context.Context, _ time.Duration) error {
					allowed, err := s.Store.JobExecutionAllowed(ctx)
					if err != nil || !allowed || !s.Store.Maintenance(ctx) {
						t.Fatalf("updater waiting state did not allow admitted Job execution: %v, %v", allowed, err)
					}
					_, err = s.Store.Pool.Exec(ctx, "UPDATE job_runs SET state='succeeded',finished_at=now() WHERE id='test-drained-run'")
					return err
				}
			}
			if mode == "interrupted" {
				func() {
					defer func() {
						if recover() == nil {
							t.Error("interruption was not injected")
						}
					}()
					_ = runner.Run(ctx, o.ID)
				}()
			}
			e = runner.Run(ctx, o.ID)
			state, err := s.ReadOperation(ctx)
			if err != nil {
				t.Fatal(err)
			}
			expected := map[string]string{"success": "succeeded", "health-failure": "rolled_back", "unsafe-recovery": "recovery_required", "pull-failure": "failed", "interrupted": "succeeded", "drain-cancelled": "failed", "drain-admitted": "succeeded", "drain-expired": "failed"}[mode]
			if state.State != expected {
				t.Fatal(state.State, state.Error, e)
			}
			if len(state.Cipher) > 0 {
				t.Fatal("backup passphrase retained")
			}
			if mode == "interrupted" {
				raw, _ := os.ReadFile(filepath.Join(dir, "install.json"))
				var i release.Installation
				json.Unmarshal(raw, &i)
				if i.Revision != installed.Revision+1 {
					t.Fatal("resumption incremented installation revision twice")
				}
			}
			wantBackups := 1
			if mode == "pull-failure" || mode == "drain-cancelled" || mode == "drain-expired" {
				wantBackups = 0
			}
			if backups != wantBackups {
				t.Fatalf("created %d backups, want %d", backups, wantBackups)
			}
			if s.Store.Maintenance(ctx) != (mode == "unsafe-recovery") {
				t.Fatal("incorrect maintenance state")
			}
			if mode == "drain-cancelled" {
				var count int
				s.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE state='running'").Scan(&count)
				if count != 1 || state.DrainDeadline.IsZero() {
					t.Fatal("running deployment was terminated or drain deadline was lost")
				}
			}
			if mode == "drain-expired" {
				var jobState string
				err = s.Store.Pool.QueryRow(ctx, "SELECT state FROM job_runs WHERE id='test-drained-run'").Scan(&jobState)
				if err != nil || jobState != "retry_wait" || !strings.Contains(state.Error, "did not finish") {
					t.Fatalf("expired drain changed the admitted Job or reported the wrong failure: %s, %s, %v", jobState, state.Error, err)
				}
			}
			before := len(commands)
			if e = runner.Run(ctx, o.ID); e != nil {
				t.Fatal(e)
			}
			if len(commands) != before {
				t.Fatal("terminal operation replayed installation commands")
			}
			for _, cmd := range commands {
				if strings.Contains(cmd, "long-backup-passphrase") {
					t.Fatal("secret in command arguments")
				}
			}
		})
	}
}
