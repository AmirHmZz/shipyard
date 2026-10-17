package control

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"strings"
	"testing"
	"time"
)

func TestLinuxDirectIPNetworking(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" {
		t.Skip("requires isolated Docker/SSH fixture")
	}
	c := testController(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	host := os.Getenv("SHIPYARD_FIXTURE_HOST")
	key, e := os.ReadFile(os.Getenv("SHIPYARD_FIXTURE_PRIVATE_KEY_FILE"))
	if e != nil {
		t.Fatal(e)
	}
	fingerprint, e := remote.Fingerprint(ctx, host, 2222)
	if e != nil {
		t.Fatal(e)
	}
	server := resource(t, c, "server", "", "", model.Server{Host: host, Port: 2222, User: "root", Fingerprint: fingerprint}, map[string]string{"private_key": string(key)})
	team := resource(t, c, "team", "", "", map[string]any{}, nil)
	_, _ = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", server.ID, team.ID)
	source := `services:
  web:
    image: busybox:1.37.0
    deploy:
      replicas: 2
    ports: ["19999:8080"]
    command: [sh, -c, "mkdir -p /www; echo hello > /www/index.html; exec httpd -f -p 8080 -h /www"]
  private:
    image: busybox:1.37.0
    command: [sh, -c, "echo preserved > /state/marker; exec sleep 600"]
    volumes: [state:/state]
volumes:
  state: {}
`
	spec := model.App{Source: "compose", Engine: "compose", ServerID: server.ID, Context: ".", File: "compose.yaml", HealthTimeout: 15}
	app := resource(t, c, "application", "", team.ID, spec, map[string]string{"compose": source})
	route := resource(t, c, "route", app.ID, team.ID, model.Route{Protocol: "https", TLS: "terminate", Domain: "app.example.com", Service: "web", TargetPort: 8080}, nil)
	cert, pool := certificate(t)
	encrypted, _ := c.Store.Vault.Seal(cert, "certificate:"+route.ID)
	if _, e = c.Store.Pool.Exec(ctx, "INSERT INTO domain_state(route_id,domain,certificate,expires_at,dns_state,certificate_state) VALUES($1,'app.example.com',$2,now()+interval '1 hour','ready','ready')", route.ID, encrypted); e != nil {
		t.Fatal(e)
	}
	catalog, e := c.Services(ctx, app)
	if e != nil || len(catalog) != 2 {
		t.Fatal("service discovery", catalog, e)
	}
	if !catalog[1].IgnoredPorts || catalog[1].Replicas != 2 {
		t.Fatal("port notice/replicas missing", catalog)
	}
	run := func(rollback string) model.Deployment {
		t.Helper()
		d, e := c.Queue(ctx, app, "", rollback)
		if e != nil {
			t.Fatal(e)
		}
		if e = c.deploy(ctx, d.ID); e != nil {
			events, _ := c.Store.Events(ctx, d.ID, 0)
			t.Fatal(e, events)
		}
		d, _ = c.Store.Deployment(ctx, d.ID)
		return d
	}
	first := run("")
	active, e := c.Store.Active(ctx, app.ID)
	if e != nil || len(active.Targets) != 2 {
		t.Fatal("routed replicas missing", active, e)
	}
	if active.Targets[0].Address == active.Targets[1].Address || active.Targets[0].Address == "127.0.0.1" {
		t.Fatal("not distinct bridge addresses", active.Targets)
	}
	for _, ep := range active.Networks {
		if ep.Service != "web" {
			t.Fatal("private service was placed on ingress", ep)
		}
	}
	ssh, _, e := c.connect(ctx, server.ID)
	if e != nil {
		t.Fatal(e)
	}
	defer ssh.Close()
	out, e := deploy.Output(ctx, ssh, "docker", "inspect", active.Containers[0])
	if e != nil {
		t.Fatal(e)
	}
	var containers []struct {
		HostConfig struct{ PortBindings map[string]any }
	}
	_ = json.Unmarshal([]byte(out), &containers)
	if len(containers) == 0 || len(containers[0].HostConfig.PortBindings) > 0 {
		t.Fatal("Compose source published a host port", out)
	}
	client := http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool, ServerName: "app.example.com", MinVersion: tls.VersionTLS12}}}
	get := func() {
		t.Helper()
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://"+net.JoinHostPort(host, "443")+"/", nil)
		req.Host = "app.example.com"
		res, e := client.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(res.Body)
		if res.StatusCode != 200 || strings.TrimSpace(string(body)) != "hello" {
			t.Fatal(res.StatusCode, string(body))
		}
	}
	get()
	req, _ := http.NewRequestWithContext(ctx, "GET", "http://"+net.JoinHostPort(host, "80")+"/unchanged", nil)
	req.Host = "app.example.com"
	redirectClient := http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, e := redirectClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	res.Body.Close()
	if res.StatusCode != 308 || res.Header.Get("Location") != "https://app.example.com/unchanged" {
		t.Fatal("HTTPS redirect missing", res.StatusCode, res.Header)
	}
	network, e := c.NewNetwork(ctx, server.ID, "Shared test bridge", "", model.Network{Subnet: "172.28.48.0/24", EnableIPv6: true, IPv6Subnet: "fd44:1234:5678::/64"})
	if e != nil {
		t.Fatal(e)
	}
	if e = c.EnsureNetwork(ctx, network.ID); e != nil {
		t.Fatal(e)
	}
	_, _ = c.Store.Pool.Exec(ctx, "INSERT INTO resource_grants(resource_id,team_id) VALUES($1,$2)", network.ID, team.ID)
	spec.Networking = map[string]model.ServiceNetworking{"web": {Hostname: "web-fixed", Connections: []model.NetworkAttachment{{NetworkID: network.ID, IPv4: "172.28.48.10", IPv6: "fd44:1234:5678::10"}}}}
	probe := active
	probe.App.Networking = spec.Networking
	if e = c.preflightNetworks(ctx, probe); e == nil {
		t.Fatal("fixed IP for a replica set accepted")
	}
	get()
	spec.PublishedPorts = map[string][]model.PublishedPort{"web": {{Host: "127.0.0.1", Published: 19998, Target: 8080, Protocol: "tcp"}}}
	source = strings.Replace(source, "replicas: 2", "replicas: 1", 1)
	raw, _ := json.Marshal(spec)
	app, e = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Version: app.Version, Data: raw, Secrets: map[string]string{"compose": source}})
	if e != nil {
		t.Fatal(e)
	}
	unchanged, _ := c.Store.Active(ctx, app.ID)
	if len(unchanged.Targets) != 2 {
		t.Fatal("network settings changed before deployment")
	}
	run("")
	get()
	active, _ = c.Store.Active(ctx, app.ID)
	if len(active.Targets) != 1 {
		t.Fatal("scale change failed")
	}
	var fixed bool
	for _, ep := range active.Networks {
		if ep.NetworkID == network.ID {
			fixed = ep.IPv4 == "172.28.48.10" && ep.IPv6 == "fd44:1234:5678::10"
		}
	}
	for _, target := range active.Targets {
		bindings, err := deploy.Output(ctx, ssh, "docker", "inspect", "--format", "{{json .HostConfig.PortBindings}}", target.Container)
		if err != nil || !strings.Contains(bindings, "19998") {
			t.Fatal("administrator port exception missing", bindings, err)
		}
	}
	if !fixed {
		t.Fatal("fixed dual-stack reservation missing", active.Networks)
	}
	network, _ = c.Store.Resource(ctx, network.ID)
	networkSpec, _ := model.Decode[model.Network](network)
	out, e = deploy.Output(ctx, ssh, "docker", "run", "--rm", "--network", networkSpec.DockerName, "busybox:1.37.0", "nslookup", "web-fixed")
	if e != nil || !strings.Contains(out, "172.28.48.10") {
		t.Fatal("hostname resolution", out, e)
	}
	if e = c.DeleteNetwork(ctx, network); e == nil {
		t.Fatal("attached network deleted")
	}
	spec.PublishedPorts = nil
	raw, _ = json.Marshal(spec)
	app, e = c.Store.Save(ctx, app.ID, model.ResourceInput{Kind: app.Kind, Name: app.Name, Version: app.Version, Data: raw})
	if e != nil {
		t.Fatal(e)
	}
	run(first.ReleaseID)
	get()
	active, _ = c.Store.Active(ctx, app.ID)
	if len(active.Targets) != 2 {
		t.Fatal("rollback did not restore replica configuration")
	}
	id, e := c.QueueDeletion(ctx, app, "test")
	if e != nil {
		t.Fatal(e)
	}
	if e = c.deleteTree(ctx, model.Job{ID: id, ResourceID: app.ID}); e != nil {
		t.Fatal(e)
	}
	if e = c.DeleteNetwork(ctx, network); e != nil {
		t.Fatal(e)
	}
	out, e = deploy.Output(ctx, ssh, "docker", "volume", "inspect", "sy-"+app.ID+"_state")
	if e != nil || !json.Valid([]byte(out)) {
		t.Fatal("persistent volume removed", e)
	}
	externalName := "external-" + app.ID
	externalID, e := deploy.Output(ctx, ssh, "docker", "network", "create", externalName)
	if e != nil {
		t.Fatal(e)
	}
	defer deploy.Output(context.WithoutCancel(ctx), ssh, "docker", "network", "rm", externalID)
	external, e := c.NewNetwork(ctx, server.ID, "External preserved", externalID, model.Network{})
	if e != nil {
		t.Fatal(e)
	}
	if e = c.EnsureNetwork(ctx, external.ID); e != nil {
		t.Fatal(e)
	}
	external, _ = c.Store.Resource(ctx, external.ID)
	if e = c.DeleteNetwork(ctx, external); e != nil {
		t.Fatal(e)
	}
	if _, e = deploy.Output(ctx, ssh, "docker", "network", "inspect", externalID); e != nil {
		t.Fatal("external network deleted", e)
	}
	t.Log("Direct IP HTTPS routing, per-replica reservations, private-service isolation, stripped ports, dual-stack fixed IPs, hostnames, pending changes, rollback and cleanup passed")
}
