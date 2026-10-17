package control

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/proxy"
	"shipyard/internal/remote"
)

func TestLinuxHostnameMapsAndRecovery(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires an isolated prepared SSH fixture")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	host := os.Getenv("SHIPYARD_FIXTURE_HOST")
	key, err := os.ReadFile(os.Getenv("SHIPYARD_FIXTURE_PRIVATE_KEY_FILE"))
	if err != nil {
		t.Fatal(err)
	}
	fingerprint, err := remote.Fingerprint(ctx, host, 2222)
	if err != nil {
		t.Fatal(err)
	}
	client, err := remote.Dial(ctx, model.Server{Host: host, Port: 2222, User: "root", Fingerprint: fingerprint}, string(key), "")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	file := filepath.Join(t.TempDir(), "backend")
	cmd := exec.CommandContext(ctx, "go", "build", "-buildvcs=false", "-o", file, "../../tests/fixture")
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatal(err, string(output))
	}
	binary, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	root := remote.Root + "/map-fixture"
	if err = client.Run(ctx, remote.Command("mkdir", "-p", root), nil, io.Discard); err != nil {
		t.Fatal(err)
	}
	if err = deploy.Write(ctx, client, root+"/backend", binary); err != nil {
		t.Fatal(err)
	}
	if err = client.Run(ctx, remote.Command("chmod", "755", root+"/backend"), nil, io.Discard); err != nil {
		t.Fatal(err)
	}
	bindings := []proxy.Binding{}
	if _, err = deploy.Output(ctx, client, "docker", "network", "create", "shipyard-map-test"); err != nil {
		t.Fatal(err)
	}
	defer client.Run(context.WithoutCancel(ctx), remote.Command("docker", "network", "rm", "shipyard-map-test"), nil, io.Discard)
	cert, pool := certificate(t)
	certs := map[string][]byte{}
	for i, kind := range []string{"wild", "specific", "exact"} {
		name := "shipyard-map-" + kind
		if err = client.Run(ctx, remote.Command("docker", "run", "-d", "--name", name, "--entrypoint", "/fixture/backend", "-e", "VERSION="+kind, "-v", root+":/fixture:ro", "--network", "shipyard-map-test", proxy.Image), nil, io.Discard); err != nil {
			t.Fatal(err)
		}
		defer client.Run(context.WithoutCancel(ctx), remote.Command("docker", "rm", "-f", name), nil, io.Discard)
		address, err := deploy.Output(ctx, client, "docker", "inspect", "--format", "{{(index .NetworkSettings.Networks \"shipyard-map-test\").IPAddress}}", name)
		if err != nil {
			t.Fatal(err)
		}
		certs[kind] = cert
		bindings = append(bindings, proxy.Binding{ID: kind, Certificate: true, Route: model.Route{Protocol: "https", TLS: "terminate", Domain: []string{"*.example.com", "*.sub.example.com", "api.example.com"}[i]}, Targets: []model.Target{{Address: address, Port: 8080}}})
	}
	config, err := proxy.Render(bindings)
	if err != nil {
		t.Fatal(err)
	}
	maps, err := proxy.RoutingMaps(bindings)
	if err != nil {
		t.Fatal(err)
	}
	if err = proxy.Apply(ctx, client, config, certs, io.Discard, maps); err != nil {
		t.Fatal(err)
	}
	httpClient := &http.Client{Timeout: 3 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool, ServerName: "app.example.com", MinVersion: tls.VersionTLS12}}}
	check := func(hostname, expected string) {
		t.Helper()
		for attempt := 0; attempt < 30; attempt++ {
			req, _ := http.NewRequestWithContext(ctx, "GET", "https://"+net.JoinHostPort(host, "443")+"/api/unchanged?flag=yes", nil)
			req.Host = hostname
			res, err := httpClient.Do(req)
			if err == nil {
				var body map[string]string
				_ = json.NewDecoder(res.Body).Decode(&body)
				res.Body.Close()
				if expected == "" && res.StatusCode == 503 {
					return
				}
				if body["version"] == expected && body["path"] == "/api/unchanged" {
					return
				}
			}
			time.Sleep(200 * time.Millisecond)
		}
		t.Fatal("unexpected hostname mapping", hostname, expected)
	}
	check("API.EXAMPLE.COM.:80", "exact")
	check("www.example.com", "wild")
	check("a.sub.example.com", "specific")
	check("example.com", "")
	check("badexample.com", "")
	check("unknown.test", "")
	bad := map[string][]byte{"hosts.map": maps["hosts.map"], "wildcards.map": []byte("[( b_wild\n"), "redirects.map": maps["redirects.map"]}
	if err = proxy.Apply(ctx, client, config, certs, io.Discard, bad); err == nil {
		t.Fatal("invalid map regex accepted")
	}
	check("api.example.com", "exact")
	if err = client.Run(ctx, "cd /var/lib/shipyard/proxy && cp haproxy.cfg previous.cfg && rm -rf previous-certs previous-maps && cp -a certs previous-certs && cp -a maps previous-maps && echo existing > pending", nil, io.Discard); err != nil {
		t.Fatal(err)
	}
	if err = deploy.Write(ctx, client, remote.Root+"/proxy/maps/wildcards.map", []byte("[( b_bad\n")); err != nil {
		t.Fatal(err)
	}
	if err = proxy.Apply(ctx, client, config, certs, io.Discard, maps); err != nil {
		t.Fatal("interrupted maps recovery", err)
	}
	check("a.sub.example.com", "specific")
	badConfig, err := proxy.Render(bindings, proxy.Options{Bindings: proxy.Bindings{"web": {"203.0.113.254"}}})
	if err != nil {
		t.Fatal(err)
	}
	if err = proxy.Apply(ctx, client, badConfig, certs, io.Discard, maps); err == nil {
		t.Fatal("unassigned bind accepted")
	}
	check("api.example.com", "exact")
	check("a.sub.example.com", "specific")
	t.Log("hostname normalization, exact/wildcard precedence, unchanged paths, invalid maps, interruption and bind recovery passed")
}
