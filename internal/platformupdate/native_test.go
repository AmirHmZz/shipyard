package platformupdate

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"github.com/google/uuid"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"shipyard/internal/buildinfo"
	"shipyard/internal/db"
	"shipyard/internal/model"
	"shipyard/internal/release"
	"shipyard/internal/remote"
	"shipyard/internal/secure"
	"shipyard/internal/testdb"
	"strings"
	"syscall"
	"testing"
	"time"
)

// The only substituted operations are registry downloads: synthetic release
// digests select locally built images. Compose, migrations, backups, container
// replacement, ingress attachment and HTTPS health checks are real.
func TestLinuxNativeVersionChanges(t *testing.T) {
	if os.Getenv("SHIPYARD_UPDATE_INTEGRATION") != "1" {
		t.Skip("requires disposable Linux Docker host")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()
	url := testdb.URL(t)
	master := base64.StdEncoding.EncodeToString(make([]byte, 32))
	vault, _ := secure.New(master)
	store, e := db.Open(ctx, url, vault)
	if e != nil {
		t.Fatal(e)
	}
	defer store.Pool.Close()
	if e = os.MkdirAll("/opt/shipyard", 0750); e != nil {
		t.Fatal(e)
	}
	os.Chown("/opt/shipyard", 0, 10001)
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	ca := &x509.Certificate{SerialNumber: big.NewInt(10), Subject: pkix.Name{CommonName: "Isolated release test CA"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(120 * 24 * time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature}
	caDER, e := x509.CreateCertificate(rand.Reader, ca, ca, &key.PublicKey, key)
	if e != nil {
		t.Fatal(e)
	}
	caCert, _ := x509.ParseCertificate(caDER)
	caPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER})
	os.WriteFile("/opt/shipyard/test-ca.pem", caPEM, 0644)
	t.Setenv("SSL_CERT_FILE", "/opt/shipyard/test-ca.pem")
	leaf := &x509.Certificate{SerialNumber: big.NewInt(11), DNSNames: []string{"panel.example.com"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(90 * 24 * time.Hour), ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, KeyUsage: x509.KeyUsageDigitalSignature}
	leafDER, e := x509.CreateCertificate(rand.Reader, leaf, caCert, &key.PublicKey, key)
	if e != nil {
		t.Fatal(e)
	}
	bundle := append(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: leafDER}), caPEM...)
	bundle = append(bundle, pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})...)
	routeID := "shipyard-dashboard-route-release-test"
	route, _ := json.Marshal(model.Route{Protocol: "https", TLS: "terminate", Domain: "panel.example.com", Service: "dashboard", TargetPort: 8080})
	_, e = store.Pool.Exec(ctx, "INSERT INTO resources(id,kind,name,parent_id,data) VALUES($1,'route',NULL,'shipyard-dashboard',$2)", routeID, route)
	if e != nil {
		t.Fatal(e)
	}
	encrypted, _ := vault.Seal(bundle, "certificate:"+routeID)
	_, e = store.Pool.Exec(ctx, "INSERT INTO domain_state(route_id,domain,certificate,expires_at,certificate_domain,certificate_ca,certificate_state) VALUES($1,'panel.example.com',$2,now()+interval '90 days','panel.example.com','https://acme-v02.api.letsencrypt.org/directory','ready')", routeID, encrypted)
	if e != nil {
		t.Fatal(e)
	}
	access, _ := json.Marshal(map[string]any{"version": 1, "domain": "panel.example.com", "routeId": routeID, "activeDomain": "panel.example.com", "activeRouteId": routeID})
	store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES('dashboard-access',$1)", access)
	if _, e = store.Pool.Exec(ctx, `INSERT INTO settings(key,value) VALUES('haproxy:shipyard-local','{"version":1,"bindings":{"web":["127.0.0.2"]}}')`); e != nil {
		t.Fatal(e)
	}
	local := remote.NewDocker("/var/run/docker.sock", "shipyard-host-executor")
	daemon, e := local.Identity(ctx)
	if e != nil {
		t.Fatal(e)
	}
	compose, e := os.ReadFile("/fixtures/compose.host.yaml")
	if e != nil {
		t.Fatal(e)
	}
	compose = []byte(strings.Replace(string(compose), "DATABASE_URL: postgres://shipyard:${POSTGRES_PASSWORD:?Configure the installation}@postgres:5432/shipyard?sslmode=disable", "DATABASE_URL: ${SHIPYARD_TEST_DATABASE_URL}\n      SSL_CERT_FILE: /installation/test-ca.pem", 1))
	// PostgreSQL belongs to the fixture's existing private network, rather than
	// this installation's Compose project. Production keeps both on its default network.
	compose = []byte(strings.Replace(string(compose), "  shipyard:\n", "  shipyard:\n    networks: [default, native-control]\n", 1) + "\nnetworks:\n  native-control:\n    external: true\n    name: native-control\n")
	all, _ := db.MigrationCatalog()
	manifest := func(version, previous, digest string) release.Manifest {
		return release.Manifest{Format: 1, Version: version, Previous: previous, Schema: db.LatestSchema(), Migrations: all, Architectures: []string{"amd64", "arm64"}, CoreImage: release.CoreRepository + "@sha256:" + strings.Repeat(digest, 64), ExecutorImage: release.ExecutorRepository + "@sha256:" + strings.Repeat(digest, 64), UpdaterProtocol: 1, MinimumDocker: 27, MinimumCompose: "2.24.0", PostgresMajor: 18, Assets: map[string]string{"compose.host.yaml": release.Hash(compose), "install.sh": release.Hash([]byte("fixture installer"))}}
	}
	first, next := manifest("0.1.0", "", "a"), manifest("0.1.1", "0.1.0", "b")
	images := map[string]string{first.CoreImage: "shipyard:native-check", first.ExecutorImage: "shipyard-executor:native-check", next.CoreImage: "shipyard:native-next", next.ExecutorImage: "shipyard-executor:native-next"}
	installed := release.Installation{Format: 1, Revision: 1, Directory: "/opt/shipyard", DaemonID: daemon, Project: "shipyard", ControlContainer: "shipyard-shipyard-1", ExecutorContainer: "shipyard-host-executor", Release: first}
	raw, _ := json.MarshalIndent(installed, "", "  ")
	os.WriteFile("/opt/shipyard/install.json", raw, 0640)
	os.Chown("/opt/shipyard/install.json", 0, 10001)
	raw, _ = json.Marshal(first)
	os.WriteFile("/opt/shipyard/release.json", raw, 0600)
	os.WriteFile("/opt/shipyard/compose.host.yaml", compose, 0600)
	os.MkdirAll("/platform-data", 0700)
	os.Chown("/platform-data", 10001, 10001)
	socket, e := os.Stat("/var/run/docker.sock")
	if e != nil {
		t.Fatal(e)
	}
	env := fmt.Sprintf("POSTGRES_PASSWORD=shipyard\nSHIPYARD_MASTER_KEY=%s\nSHIPYARD_BOOTSTRAP_TOKEN=native-release-test-only\nSHIPYARD_ORIGIN=https://panel.example.com\nSHIPYARD_PUBLIC_IPV4=192.0.2.10\nSHIPYARD_TEST_DATABASE_URL=%s\nDOCKER_SOCKET_GID=%d\nSHIPYARD_DOCKER_ROOT_DIR=/var/lib/docker\nSENTRY_DSN=\nSHIPYARD_IMAGE=%s\nSHIPYARD_EXECUTOR_IMAGE=%s\n", master, url, socket.Sys().(*syscall.Stat_t).Gid, first.CoreImage, first.ExecutorImage)
	os.WriteFile("/opt/shipyard/.env", []byte(env), 0600)
	run := func(ctx context.Context, args ...string) ([]byte, error) {
		translated := append([]string{}, args...)
		if len(args) > 2 && args[0] == "docker" && args[1] == "pull" {
			return command(ctx, "docker", "image", "inspect", images[args[2]])
		}
		for n, arg := range translated {
			if image := images[arg]; image != "" {
				translated[n] = image
			}
		}
		for n, arg := range translated {
			if arg == "--env-file" && n+1 < len(translated) && strings.HasSuffix(translated[n+1], "/.env") {
				b, e := os.ReadFile(translated[n+1])
				if e != nil {
					return nil, e
				}
				for pin, tag := range images {
					b = []byte(strings.ReplaceAll(string(b), pin, tag))
				}
				path := translated[n+1] + ".fixture"
				os.WriteFile(path, b, 0600)
				translated[n+1] = path
			}
		}
		return command(ctx, translated...)
	}
	runner := &Runner{Store: store, DatabaseURL: url, Command: run, DataDir: "/platform-data", InstallDir: "/opt/shipyard"}
	if _, e = runner.compose(ctx, "up", "-d", "--no-deps", "host-executor", "shipyard"); e != nil {
		t.Fatal(e)
	}
	defer runner.compose(context.Background(), "stop", "shipyard", "host-executor")
	if e = runner.verify(ctx, installed); e != nil {
		out, _ := command(ctx, "docker", "logs", "shipyard-shipyard-1")
		t.Fatal(e, string(out))
	}
	proxyBefore, e := command(ctx, "docker", "ps", "-q", "--filter", "name=shipyard-haproxy")
	if e != nil {
		t.Fatal(e)
	}
	command(ctx, "docker", "run", "-d", "--name", "release-unrelated-app", "--network", "host", "busybox:1.37.0", "sh", "-c", "mkdir -p /www; echo alive >/www/index.html; exec httpd -f -p 18089 -h /www")
	defer command(context.Background(), "docker", "rm", "-f", "release-unrelated-app")
	trafficCtx, stopTraffic := context.WithCancel(ctx)
	defer stopTraffic()
	traffic := make(chan error, 1)
	go func() {
		client := &http.Client{Timeout: time.Second}
		for {
			select {
			case <-trafficCtx.Done():
				traffic <- nil
				return
			case <-time.After(100 * time.Millisecond):
				res, e := client.Get("http://127.0.0.1:18089")
				if e != nil {
					traffic <- e
					return
				}
				res.Body.Close()
				if res.StatusCode != 200 {
					traffic <- fmt.Errorf("application status %d", res.StatusCode)
					return
				}
			}
		}
	}()
	assets := map[string][]byte{"compose.host.yaml": compose, "install.sh": []byte("fixture installer")}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(r.URL.Path, "/")
		v := strings.TrimPrefix(parts[len(parts)-2], "v")
		m := first
		if v == next.Version {
			m = next
		}
		raw, _ := json.Marshal(m)
		name := filepath.Base(r.URL.Path)
		switch name {
		case "release.json":
			w.Write(raw)
		case "SHA256SUMS":
			fmt.Fprintln(w, release.Hash(raw)+"  release.json")
		default:
			w.Write(assets[name])
		}
	}))
	defer server.Close()
	runner.Catalog = release.Catalog{Downloads: server.URL}
	service := &Service{Store: store, Local: local, InstallPath: "/opt/shipyard/install.json"}
	oldVersion := buildinfo.Version
	defer func() { buildinfo.Version = oldVersion }()
	for _, target := range []release.Manifest{next, first} {
		b, _ := os.ReadFile(service.InstallPath)
		json.Unmarshal(b, &installed)
		buildinfo.Version = installed.Release.Version
		raw, _ := json.Marshal([]release.Manifest{first, next})
		store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES('release-catalog',$1) ON CONFLICT(key) DO UPDATE SET value=$1", raw)
		plan, e := service.Prepare(ctx, target.Version, "integration-admin")
		if e != nil {
			t.Fatal(e)
		}
		// Synthetic registry pins cannot be pulled by the ordinary coordinator.
		// Launcher behavior is tested separately; exercise its durable preflight boundary.
		op := Operation{ID: uuid.NewString(), Actor: "integration-admin", Plan: plan, State: "preflight", CreatedAt: time.Now()}
		op.Cipher, e = vault.Seal([]byte("fresh-native-test-backup-passphrase"), "platform-update:"+op.ID)
		if e != nil {
			t.Fatal(e)
		}
		if e = Save(ctx, store, op); e != nil {
			t.Fatal(e)
		}
		if e = runner.Run(ctx, op.ID); e != nil {
			state, _ := service.ReadOperation(ctx)
			t.Fatal(e, state.Error)
		}
		state, _ := service.ReadOperation(ctx)
		if state.State != "succeeded" || state.Backup == "" {
			t.Fatal(state.State)
		}
		if _, e = os.Stat(state.Backup); e != nil {
			t.Fatal(e)
		}
		t.Log("real native version change", plan.Current.Version, "to", target.Version, "completed")
	}
	stopTraffic()
	if e = <-traffic; e != nil {
		t.Fatal("application traffic interrupted", e)
	}
	proxyAfter, _ := command(ctx, "docker", "ps", "-q", "--filter", "name=shipyard-haproxy")
	if string(proxyBefore) != string(proxyAfter) {
		t.Fatal("version change replaced HAProxy")
	}
	var target struct{ Address string }
	store.Pool.QueryRow(ctx, "SELECT data->>'address' FROM resources WHERE id='shipyard-dashboard'").Scan(&target.Address)
	if net.ParseIP(target.Address) == nil {
		t.Fatal("lost dashboard reserved address")
	}
}
