package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"os"
	"os/signal"
	"path/filepath"

	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"shipyard/internal/api"
	"shipyard/internal/backup"
	"shipyard/internal/buildinfo"
	"shipyard/internal/certs"
	"shipyard/internal/control"
	"shipyard/internal/db"
	"shipyard/internal/platformupdate"
	"shipyard/internal/remote"
	"shipyard/internal/secure"
	"shipyard/internal/telemetry"
)

func main() {
	config := telemetry.FromEnv()
	if err := config.Init(); err != nil {
		slog.Warn("Sentry initialization failed", "error", err)
	}
	logger := slog.New(telemetry.ErrorHandler{Local: slog.NewJSONHandler(os.Stdout, nil)})
	slog.SetDefault(logger)
	if err := run(); err != nil {
		slog.Error("shipyard stopped", "error", err)
		telemetry.Flush()
		os.Exit(1)
	}
	telemetry.Flush()
}
func env(key, defaultValue string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultValue
}
func run() error {
	if len(os.Args) > 1 && os.Args[1] == "version" {
		return json.NewEncoder(os.Stdout).Encode(buildinfo.Current())
	}
	if len(os.Args) > 1 && os.Args[1] == "keygen" {
		b := make([]byte, 32)
		if _, e := rand.Read(b); e != nil {
			return e
		}
		fmt.Println(base64.StdEncoding.EncodeToString(b))
		return nil
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	dataDir := env("SHIPYARD_DATA_DIR", "./data")
	if e := os.MkdirAll(dataDir, 0700); e != nil {
		return e
	}
	if len(os.Args) > 1 && os.Args[1] == "restore" {
		if len(os.Args) != 3 {
			return fmt.Errorf("usage: shipyard restore /path/to/backup.sybackup (passphrase on stdin)")
		}
		pass, e := io.ReadAll(io.LimitReader(os.Stdin, 4096))
		if e != nil {
			return e
		}
		encrypted, e := os.ReadFile(os.Args[2])
		if e != nil {
			return e
		}
		keyPath, e := backup.Restore(ctx, databaseURL, dataDir, strings.TrimSpace(string(pass)), encrypted)
		if e != nil {
			return e
		}
		fmt.Println("Restore complete. Set SHIPYARD_MASTER_KEY from " + filepath.Clean(keyPath) + " before starting Shipyard. Disable maintenance mode after checking the restored state.")
		return nil
	}
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		pool, e := pgxpool.New(ctx, databaseURL)
		if e != nil {
			return e
		}
		defer pool.Close()
		state, e := db.MigrationState(ctx, pool)
		if e != nil {
			return e
		}
		target := db.LatestSchema()
		allow := false
		if len(os.Args) < 3 {
			return fmt.Errorf("provide a migration command")
		}
		for _, arg := range os.Args[3:] {
			if arg == "--allow-data-loss" {
				allow = true
			} else {
				if _, e = fmt.Sscan(arg, &target); e != nil {
					return e
				}
			}
		}
		if len(os.Args) < 3 {
			return fmt.Errorf("usage: shipyard migrate status|plan|apply [schema] [--allow-data-loss]")
		}
		switch os.Args[2] {
		case "status":
			return json.NewEncoder(os.Stdout).Encode(state)
		case "catalog":
			all, e := db.MigrationCatalog()
			if e != nil {
				return e
			}
			return json.NewEncoder(os.Stdout).Encode(all)
		case "plan":
			all, e := db.MigrationCatalog()
			if e != nil {
				return e
			}
			plan, e := db.PlanMigrations(state.Current, target, all)
			if e != nil {
				return e
			}
			return json.NewEncoder(os.Stdout).Encode(plan)
		case "apply":
			return db.ApplyMigrations(ctx, pool, target, allow)
		default:
			return fmt.Errorf("unknown migration command")
		}
	}
	vault, e := secure.New(os.Getenv("SHIPYARD_MASTER_KEY"))
	if e != nil {
		return e
	}
	if os.Getenv("SHIPYARD_LOCAL_ENABLED") == "true" {
		pool, err := pgxpool.New(ctx, databaseURL)
		if err != nil {
			return err
		}
		state, err := db.MigrationState(ctx, pool)
		pool.Close()
		if err != nil {
			return err
		}
		if state.Current != db.LatestSchema() {
			return fmt.Errorf("database schema %d is incompatible; run the explicit migration command before starting this release", state.Current)
		}
	}
	store, e := db.Open(ctx, databaseURL, vault)
	if e != nil {
		return e
	}
	defer store.Pool.Close()
	logger := slog.Default()
	controller := &control.Controller{Store: store, Issuer: certs.FromEnv(store), DataDir: dataDir, Logger: logger}
	if os.Getenv("SHIPYARD_LOCAL_ENABLED") == "true" {
		controller.Local = remote.NewDocker(env("SHIPYARD_DOCKER_SOCKET", "/var/run/docker.sock"), env("SHIPYARD_EXECUTOR", "shipyard-host-executor"))
		controller.SelfContainer = env("SHIPYARD_CONTAINER", os.Getenv("HOSTNAME"))
		controller.InitialDomain = strings.TrimPrefix(strings.TrimRight(os.Getenv("SHIPYARD_ORIGIN"), "/"), "https://")
		if !strings.HasPrefix(os.Getenv("SHIPYARD_ORIGIN"), "https://") {
			return fmt.Errorf("native installation requires an HTTPS SHIPYARD_ORIGIN")
		}
		controller.InitialIPv4 = os.Getenv("SHIPYARD_PUBLIC_IPV4")
		controller.InitialIPv6 = os.Getenv("SHIPYARD_PUBLIC_IPV6")

	}
	if len(os.Args) > 1 && os.Args[1] == "dashboard-access" {
		if len(os.Args) < 3 {
			return fmt.Errorf("usage: shipyard dashboard-access configure|status|retry")
		}
		state, e := controller.Dashboard(ctx)
		if e != nil {
			return e
		}
		switch os.Args[2] {
		case "status":
			return json.NewEncoder(os.Stdout).Encode(state)
		case "configure":
			if len(os.Args) != 4 {
				return fmt.Errorf("provide the dashboard hostname")
			}
			_, e = controller.QueueDashboard(ctx, state.Version, os.Args[3], "system")
			return e
		case "retry":
			_, e = controller.QueueDashboard(ctx, state.Version, state.Domain, "system")
			return e
		default:
			return fmt.Errorf("unknown dashboard command")
		}
	}
	if len(os.Args) > 1 && os.Args[1] == "local-host" {
		if len(os.Args) != 4 || os.Args[2] != "verify" {
			return fmt.Errorf("usage: shipyard local-host verify VERIFIED_DOCKER_DAEMON_ID")
		}
		return controller.VerifyLocalIdentity(ctx, os.Args[3])
	}
	if len(os.Args) > 1 && os.Args[1] == "cleanup-projects" {
		if len(os.Args) != 3 || os.Args[2] != "--apply" {
			return fmt.Errorf("usage: shipyard cleanup-projects --apply (stop the control-plane service first; persistent volumes are preserved)")
		}
		return controller.CleanupProjects(ctx)
	}
	if len(os.Args) > 1 && os.Args[1] == "cleanup-path-routes" {
		count, err := controller.CleanupPathRoutes(ctx)
		logger.Info("Path route cleanup complete", "deleted", count)
		return err
	}
	app := &api.API{Store: store, Control: controller, Origin: strings.TrimRight(env("SHIPYARD_ORIGIN", "http://localhost:8080"), "/"), BootstrapToken: os.Getenv("SHIPYARD_BOOTSTRAP_TOKEN"), DatabaseURL: databaseURL, Logger: logger, Telemetry: telemetry.FromEnv()}
	updates := &platformupdate.Service{Store: store, Local: controller.Local, Self: controller.SelfContainer, DatabaseURL: databaseURL}
	app.Updates = updates
	go updates.Run(ctx)
	server := &http.Server{Addr: env("SHIPYARD_LISTEN", ":8080"), Handler: app.Router(), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second, MaxHeaderBytes: 1 << 20}
	done := make(chan struct{})
	go func() { controller.Run(ctx); close(done) }()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	logger.Info("Shipyard listening", "address", server.Addr)
	err := server.ListenAndServe()
	stop()
	<-done
	if err != http.ErrServerClosed {
		return err
	}
	return nil
}
