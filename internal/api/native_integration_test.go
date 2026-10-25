package api

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"github.com/coder/websocket"
	"github.com/google/uuid"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"shipyard/internal/control"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/remote"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type nativeDNS struct {
	mu      sync.Mutex
	records []model.DNSRecord
}

func (d *nativeDNS) Zones(context.Context) ([]providers.ProviderZone, error) { return nil, nil }
func (d *nativeDNS) Records(context.Context, string) ([]model.DNSRecord, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return append([]model.DNSRecord(nil), d.records...), nil
}
func (d *nativeDNS) Put(_ context.Context, _ string, r model.DNSRecord) (model.DNSRecord, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	r.ID = uuid.NewString()
	d.records = append(d.records, r)
	return r, nil
}
func (d *nativeDNS) Delete(_ context.Context, _ string, id string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	for i, r := range d.records {
		if r.ID == id {
			d.records = append(d.records[:i], d.records[i+1:]...)
			break
		}
	}
	return nil
}

type nativeIssuer struct {
	bundle []byte
	fail   atomic.Bool
}

func (i *nativeIssuer) DirectoryURL() string { return "https://fake-native-ca.invalid" }
func (i *nativeIssuer) Obtain(context.Context, string, string, string) ([]byte, time.Time, error) {
	if i.fail.Load() {
		return nil, time.Time{}, errors.New("temporary test certificate failure")
	}
	return i.bundle, time.Now().Add(45 * 24 * time.Hour), nil
}
func (i *nativeIssuer) ObtainHTTP(ctx context.Context, domain string) ([]byte, time.Time, error) {
	return i.Obtain(ctx, domain, "", "")
}
func TestLinuxNativeHostBootstrapDeployAndRecovery(t *testing.T) {
	if os.Getenv("SHIPYARD_NATIVE_INTEGRATION") != "1" {
		t.Skip("requires isolated Linux Docker host")
	}
	a, _ := testAPI(t)
	c := a.Control
	c.Logger = slog.New(slog.NewTextHandler(os.Stdout, nil))
	c.Local = remote.NewDocker("/var/run/docker.sock", "shipyard-host-executor")
	c.SelfContainer = os.Getenv("HOSTNAME")
	c.InitialDomain = "shipyard.example.com"
	c.InitialIPv4 = "192.0.2.10"
	a.Origin = "https://shipyard.example.com"
	dns := &nativeDNS{}
	issuer := &nativeIssuer{bundle: testCertificateBundle(t)}
	c.DNSFactory = func(string, string) providers.DNSProvider { return dns }
	c.Issuer = issuer
	c.DashboardDNSCheck = func(context.Context, string, model.Server) error { return nil }
	roots := x509.NewCertPool()
	rest := issuer.bundle
	for len(rest) > 0 {
		block, next := pem.Decode(rest)
		rest = next
		if block == nil {
			break
		}
		if block.Type == "CERTIFICATE" {
			cert, _ := x509.ParseCertificate(block.Bytes)
			roots.AddCert(cert)
		}
	}
	secureTransport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		_, port, _ := net.SplitHostPort(address)
		return c.Local.DialContext(ctx, "tcp", "127.0.0.1:"+port)
	}}
	defer secureTransport.CloseIdleConnections()
	secureClient := &http.Client{Transport: secureTransport, Timeout: 10 * time.Second}
	c.DashboardVerify = func(ctx context.Context, origin string) error {
		res, e := secureClient.Get(origin + "/healthz")
		if e != nil {
			return e
		}
		res.Body.Close()
		if res.StatusCode != 200 {
			return errors.New("HTTPS not ready")
		}
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()
	serving := &http.Server{Addr: ":8080", Handler: a.Router(), ReadHeaderTimeout: 5 * time.Second}
	go serving.ListenAndServe()
	done := make(chan struct{})
	go func() { c.Run(ctx); close(done) }()
	t.Cleanup(func() { cancel(); serving.Close(); <-done })
	wait := func(label string, fn func() bool) {
		t.Helper()
		deadline := time.Now().Add(120 * time.Second)
		for time.Now().Before(deadline) && ctx.Err() == nil {
			if fn() {
				return
			}
			time.Sleep(200 * time.Millisecond)
		}
		t.Fatal("timeout: " + label)
	}
	wait("automatic dashboard HTTPS", func() bool { s, e := c.Dashboard(ctx); return e == nil && s.ActiveDomain == c.InitialDomain })
	t.Log("HTTPS ready without localhost HTTP")
	challengeToken := strings.Repeat("a", 32)
	value, _ := json.Marshal(map[string]any{"authorization": "active-test-authorization", "expires": time.Now().Add(time.Minute)})
	if _, e := a.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2)", "http01:shipyard.example.com:"+challengeToken, value); e != nil {
		t.Fatal(e)
	}
	plainClient := &http.Client{Transport: secureTransport, Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for _, check := range []struct {
		host, path string
		status     int
	}{{"shipyard.example.com", "/.well-known/acme-challenge/" + challengeToken, 200}, {"wrong.example.com", "/.well-known/acme-challenge/" + challengeToken, 503}, {"shipyard.example.com", "/.well-known/acme-challenge/" + challengeToken + "/extra", 308}, {"shipyard.example.com", "/Xwell-known/acme-challenge/" + challengeToken, 308}, {"shipyard.example.com", "/api/v1/auth/status", 308}} {
		res, e := plainClient.Get("http://" + check.host + check.path)
		if e != nil {
			t.Fatal(e)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != check.status {
			t.Fatalf("HTTP isolation %s%s: %d %s", check.host, check.path, res.StatusCode, body)
		}
		if check.status == 200 && string(body) != "active-test-authorization" {
			t.Fatal("incorrect challenge response")
		}
	}
	a.Store.Pool.Exec(ctx, "DELETE FROM settings WHERE key=$1", "http01:shipyard.example.com:"+challengeToken)
	if conn, e := c.Local.DialContext(ctx, "tcp", "127.0.0.1:8080"); e == nil {
		conn.Close()
		t.Fatal("unexpected HTTP setup listener")
	}
	var token, csrf string
	request := func(client *http.Client, origin, method, path, body string) (int, []byte) {
		t.Helper()
		req, _ := http.NewRequestWithContext(ctx, method, origin+"/api/v1"+path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", origin)
		req.Header.Set("X-CSRF-Token", csrf)
		if token != "" {
			req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
		}
		res, e := client.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		if path == "/auth/setup" {
			for _, cookie := range res.Cookies() {
				if cookie.Name == "shipyard_session" {
					token = cookie.Value
					if !cookie.Secure {
						t.Fatal("HTTPS setup cookie is not secure")
					}
				}
			}
			var v struct{ CSRF string }
			json.Unmarshal(b, &v)
			csrf = v.CSRF
		}
		return res.StatusCode, b
	}
	if code, b := request(secureClient, a.Origin, "POST", "/auth/setup", `{"email":"native@example.com","name":"Native admin","password":"native-integration-password-123","token":"test-bootstrap-token"}`); code != 200 {
		t.Fatalf("setup %d %s", code, b)
	}
	if token == "" || csrf == "" {
		t.Fatal("missing HTTPS setup session")
	}
	var adminID string
	a.Store.Pool.QueryRow(ctx, "SELECT id FROM users WHERE admin").Scan(&adminID)
	save := func(kind, parent, team string, data any, secrets map[string]string) model.Resource {
		t.Helper()
		raw, _ := json.Marshal(data)
		r, e := a.Store.Save(ctx, "", model.ResourceInput{Kind: kind, Name: kind, ParentID: parent, TeamID: team, Data: raw, Secrets: secrets})
		if e != nil {
			t.Fatal(e)
		}
		return r
	}
	local, e := a.Store.Resource(ctx, control.LocalServerID)
	if e != nil {
		t.Fatal(e)
	}
	provider := save("dns", "", "", model.DNS{Provider: "cloudflare"}, map[string]string{"token": "fake-token"})
	zone := save("zone", provider.ID, "", model.Zone{Domain: "example.com", ProviderZoneID: "example"}, nil)
	team := save("team", "", "", map[string]any{}, nil)
	project := save("project", team.ID, team.ID, map[string]any{}, nil)
	environment := save("environment", project.ID, team.ID, map[string]any{}, nil)
	for _, id := range []string{local.ID, zone.ID} {
		a.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", id, team.ID)
	}
	network, e := c.NewNetwork(ctx, local.ID, "native-shared", "", model.Network{Subnet: "172.27.0.0/24", DynamicRange: "172.27.0.128/25"})
	if e != nil {
		t.Fatal(e)
	}
	wait("shared network", func() bool {
		r, _ := a.Store.Resource(ctx, network.ID)
		s, _ := model.Decode[model.Network](r)
		return s.Status == "ready"
	})
	a.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", network.ID, team.ID)
	source := func(version string) string {
		return "services:\n  web:\n    image: busybox:1.37.0\n    command: [sh, -c, 'mkdir -p /www; echo " + version + " > /www/index.html; echo native-started; exec httpd -f -p 8080 -h /www']\n    volumes: [state:/state]\n    ports: ['9876:8080']\nvolumes:\n  state: {}\n"
	}
	appSpec := model.App{Source: "compose", Engine: "compose", ServerID: local.ID, Context: ".", File: "compose.yaml", HealthTimeout: 30, Networking: map[string]model.ServiceNetworking{"web": {Hostname: "native-web", Connections: []model.NetworkAttachment{{NetworkID: network.ID, IPv4: "172.27.0.10"}}}}}
	app := save("application", environment.ID, team.ID, appSpec, map[string]string{"compose": source("first")})
	route := save("route", app.ID, team.ID, model.Route{Protocol: "https", TLS: "terminate", Domain: "app.example.com", ZoneID: zone.ID, Service: "web", TargetPort: 8080}, nil)
	if status, b := request(secureClient, "https://shipyard.example.com", "POST", "/routes/"+route.ID+"/sync", `{}`); status != 202 {
		t.Fatalf("app domain %d %s", status, b)
	}
	wait("application certificate", func() bool { s, e := c.DomainState(ctx, route.ID); return e == nil && s.Certificate == "ready" })
	deploy := func(rollback string) model.Release {
		t.Helper()
		var d model.Deployment
		var err error
		if rollback == "" {
			d, err = c.Queue(ctx, app, "", "")
		} else {
			d, err = c.Queue(ctx, app, "", rollback)
		}
		if err != nil {
			t.Fatal(err)
		}
		wait("deployment "+d.ID, func() bool {
			v, _ := a.Store.Deployment(ctx, d.ID)
			if v.State == "failed" || v.State == "recovery_failed" {
				rows, err := a.Store.Pool.Query(ctx, "SELECT message FROM events WHERE deployment_id=$1 ORDER BY id", d.ID)
				if err == nil {
					defer rows.Close()
					for rows.Next() {
						var message string
						_ = rows.Scan(&message)
						t.Log(message)
					}
				}
				t.Fatal(v.Error)
			}
			return v.State == "healthy"
		})
		r, err := a.Store.Active(ctx, app.ID)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	first := deploy("")
	// The ACME worker runs in this control-plane container. A shared network
	// must give it Docker DNS access to private applications without host ports.
	attachmentPath := "/networks/" + network.ID + "/control-plane"
	if status, body := request(secureClient, "https://shipyard.example.com", "PUT", attachmentPath, `{"attached":true}`); status != 200 || !bytes.Contains(body, []byte(`"attached":true`)) {
		t.Fatalf("attach control plane: %d %s", status, body)
	}
	privateClient := &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{Proxy: nil}}
	privateResponse, err := privateClient.Get("http://native-web:8080/")
	if err != nil {
		t.Fatal("control plane cannot reach the application hostname", err)
	}
	privateBody, err := io.ReadAll(privateResponse.Body)
	privateResponse.Body.Close()
	if err != nil || strings.TrimSpace(string(privateBody)) != "first" {
		t.Fatal("private application response", string(privateBody), err)
	}
	registered, err := a.Store.Resource(ctx, network.ID)
	if err != nil {
		t.Fatal(err)
	}
	networkSpec, err := model.Decode[model.Network](registered)
	if err != nil {
		t.Fatal(err)
	}
	if err = c.Local.API(ctx, "POST", "/networks/"+networkSpec.DockerID+"/disconnect", map[string]string{"Container": c.SelfContainer}, nil); err != nil {
		t.Fatal(err)
	}
	if err = c.ReconcileControlPlaneNetworks(ctx); err != nil {
		t.Fatal(err)
	}
	if status, body := request(secureClient, "https://shipyard.example.com", "GET", "/settings/control-plane-networks", ""); status != 200 || !bytes.Contains(body, []byte(`"attached":true`)) {
		t.Fatalf("restore control-plane attachment: %d %s", status, body)
	}
	if status, body := request(secureClient, "https://shipyard.example.com", "PUT", attachmentPath, `{"attached":false}`); status != 200 || !bytes.Contains(body, []byte(`"attached":false`)) {
		t.Fatalf("detach control plane: %d %s", status, body)
	}
	getApp := func() string {
		t.Helper()
		res, e := secureClient.Get("https://app.example.com/")
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return strings.TrimSpace(string(b))
	}
	if getApp() != "first" {
		t.Fatal("local app routing failed")
	}
	var inspect struct {
		HostConfig struct{ PortBindings map[string]any }
		Config     struct{ Hostname string }
	}
	if e = c.Local.API(ctx, "GET", "/containers/"+first.Containers[0]+"/json", nil, &inspect); e != nil {
		t.Fatal(e)
	}
	if len(inspect.HostConfig.PortBindings) != 0 || inspect.Config.Hostname != "native-web" {
		t.Fatal("host publishing or hostname mismatch", inspect)
	}
	node, _, e := c.Client(ctx, app.ID)
	if e != nil {
		t.Fatal(e)
	}
	terminalCtx, terminalCancel := context.WithTimeout(ctx, 10*time.Second)
	terminal, e := node.OpenTerminal(terminalCtx, first.Containers[0], "sh", 24, 80)
	if e != nil {
		t.Fatal(e)
	}
	terminal.Resize(40, 120)
	terminal.Write([]byte("printf 'native-terminal\\n'\nexit\n"))
	out, _ := io.ReadAll(terminal)
	terminal.Close()
	terminalCancel()
	if !bytes.Contains(out, []byte("native-terminal")) {
		t.Fatal("local terminal failed", string(out))
	}
	wsCtx, wsCancel := context.WithTimeout(ctx, 10*time.Second)
	headers := http.Header{"Origin": {"https://shipyard.example.com"}, "Cookie": {"shipyard_session=" + token}}
	ws, _, e := websocket.Dial(wsCtx, "wss://shipyard.example.com/api/v1/applications/"+app.ID+"/terminal?container="+first.Containers[0]+"&csrf="+csrf, &websocket.DialOptions{HTTPClient: secureClient, HTTPHeader: headers})
	if e != nil {
		wsCancel()
		t.Fatal("dashboard WebSocket terminal", e)
	}
	ws.Write(wsCtx, websocket.MessageText, []byte(`{"type":"resize","rows":35,"cols":110}`))
	ws.Write(wsCtx, websocket.MessageText, []byte(`{"type":"data","data":"echo native-websocket\n"}`))
	wsOutput := ""
	for !strings.Contains(wsOutput, "native-websocket") {
		_, b, err := ws.Read(wsCtx)
		if err != nil {
			t.Fatal("WebSocket terminal output", err)
		}
		wsOutput += string(b)
	}
	ws.Close(websocket.StatusNormalClosure, "test complete")
	wsCancel()
	if e = node.Run(ctx, "docker exec "+first.Containers[0]+" sh -c 'echo persistent > /state/marker'", nil, nil); e != nil {
		t.Fatal(e)
	}
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://shipyard.example.com/api/v1/applications/"+app.ID+"/logs?container="+first.Containers[0], nil)
	req.AddCookie(&http.Cookie{Name: "shipyard_session", Value: token})
	res, e := secureClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	lineReader := bufio.NewReader(res.Body)
	seen := false
	for i := 0; i < 8; i++ {
		line, e := lineReader.ReadString('\n')
		if strings.Contains(line, "native-started") {
			seen = true
			break
		}
		if e != nil {
			break
		}
	}
	res.Body.Close()
	if !seen {
		t.Fatal("local SSE logs missing")
	}
	var selfInspect struct {
		HostConfig struct{ PortBindings map[string]any }
	}
	c.Local.API(ctx, "GET", "/containers/"+c.SelfContainer+"/json", nil, &selfInspect)
	if len(selfInspect.HostConfig.PortBindings) != 0 {
		t.Fatal("dashboard publishes backend ports")
	}
	raw, _ := json.Marshal(appSpec)
	app, e = a.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Data: raw, Version: app.Version, Secrets: map[string]string{"compose": source("second")}})
	if e != nil {
		t.Fatal(e)
	}
	second := deploy("")
	if getApp() != "second" {
		t.Fatal("replacement failed")
	}
	rolled := deploy(first.ID)
	if getApp() != "first" || rolled.Images["web"] != first.Images["web"] || second.Images["web"] != first.Images["web"] {
		t.Fatal("exact configuration/image rollback failed")
	}
	var marker bytes.Buffer
	if e = node.Run(ctx, "docker exec "+rolled.Containers[0]+" cat /state/marker", nil, &marker); e != nil || strings.TrimSpace(marker.String()) != "persistent" {
		t.Fatal("local volume lost during deployment/rollback", marker.String(), e)
	}
	state, _ := c.Dashboard(ctx)
	issuer.fail.Store(true)
	a.Store.Pool.Exec(ctx, "UPDATE domain_state SET expires_at=now()+interval '1 day' WHERE route_id=$1", state.RouteID)
	if _, e = c.QueueDashboard(ctx, state.Version, state.Domain, adminID); e != nil {
		t.Fatal(e)
	}
	wait("renewal failure", func() bool {
		s, e := c.Dashboard(ctx)
		return e == nil && s.Status != nil && s.Status.Certificate == "renewal_failed"
	})
	if status, _ := request(secureClient, "https://shipyard.example.com", "GET", "/auth/me", ""); status != 200 {
		t.Fatal("renewal failure lost HTTPS")
	}
	for _, id := range []string{control.LocalServerID, control.DashboardID, control.DashboardNetworkID} {
		if status, _ := request(secureClient, "https://shipyard.example.com", "DELETE", "/resources/"+id, `{}`); status != 403 {
			t.Fatal("system resource deletable", id, status)
		}
	}
	if _, e = c.QueueDeletion(ctx, app, adminID); e != nil {
		t.Fatal(e)
	}
	wait("application deletion", func() bool { _, e := a.Store.Resource(ctx, app.ID); return e != nil })
	if status, _ := request(secureClient, "https://shipyard.example.com", "GET", "/auth/me", ""); status != 200 {
		t.Fatal("application cleanup removed dashboard")
	}
}
