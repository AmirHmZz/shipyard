package control

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"io"
	"net"
	"net/http"
	"net/url"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"strings"
	"time"
)

func (c *Controller) InitializeLocal(ctx context.Context) error {
	if c.Local == nil {
		return nil
	}
	unlock, e := c.lock(ctx, "local-host-initialize")
	if e != nil {
		return e
	}
	defer unlock()
	identity, e := c.Local.Identity(ctx)
	if e != nil {
		return e
	}
	var helper struct {
		Config     struct{ Labels map[string]string }
		HostConfig struct{ NetworkMode, PidMode string }
		State      struct{ Running bool }
	}
	if e = c.Local.API(ctx, "GET", "/containers/"+url.PathEscape(c.Local.Helper)+"/json", nil, &helper); e != nil {
		return e
	}
	if helper.Config.Labels["shipyard.role"] != "executor" || helper.HostConfig.NetworkMode != "host" || helper.HostConfig.PidMode != "host" || !helper.State.Running {
		return errors.New("local host executor must be running with the installation labels and host network/PID namespaces")
	}
	server, e := c.Store.Resource(ctx, LocalServerID)
	if errors.Is(e, pgx.ErrNoRows) {
		resources, err := c.Store.Resources(ctx, "server")
		if err != nil {
			return err
		}
		for _, r := range resources {
			v, _ := model.Decode[model.Server](r)
			if v.Connection == "local" || v.DaemonID == identity {
				return errors.New("Docker host already registered; resolve the conflicting server before enabling local host")
			}
			probe, cancel := context.WithTimeout(ctx, 8*time.Second)
			secrets, _ := c.Store.Secrets(r)
			ssh, err := remote.Dial(probe, v, secrets["private_key"], secrets["password"])
			if err == nil {
				actual, _ := ssh.Output(probe, "docker", "info", "--format", "{{.ID}}")
				ssh.Close()
				if strings.TrimSpace(actual) == identity {
					cancel()
					return fmt.Errorf("Docker host already registered as %s; preserve that server and resolve the duplicate before enabling local mode", r.Name)
				}
			}
			cancel()
		}
		raw, _ := json.Marshal(model.Server{Connection: "local", DaemonID: identity, IPv4: c.InitialIPv4, IPv6: c.InitialIPv6})
		server, e = c.Store.Save(ctx, LocalServerID, model.ResourceInput{Kind: "server", Name: "Local host", Data: raw})
	}
	if e != nil {
		return e
	}
	spec, _ := model.Decode[model.Server](server)
	if spec.Connection != "local" || spec.DaemonID != identity {
		return errors.New("local Docker identity changed; run local-host verify with the independently verified daemon ID")
	}
	var self struct {
		ID     string `json:"Id"`
		Config struct{ Labels map[string]string }
	}
	if e = c.Local.API(ctx, "GET", "/containers/"+url.PathEscape(c.SelfContainer)+"/json", nil, &self); e != nil {
		return e
	}
	if self.Config.Labels["shipyard.role"] != "control-plane" {
		return errors.New("control-plane container identity could not be verified")
	}
	c.SelfContainer = self.ID
	if _, e = deploy.Output(ctx, c.Local, "mkdir", "-p", remote.Root+"/proxy", remote.Root+"/releases", remote.Root+"/apps"); e != nil {
		return e
	}
	n, e := c.Store.Resource(ctx, DashboardNetworkID)
	if errors.Is(e, pgx.ErrNoRows) {
		raw, _ := json.Marshal(model.Network{ServerID: LocalServerID, Managed: true, IngressApp: DashboardID})
		n, e = c.Store.Save(ctx, DashboardNetworkID, model.ResourceInput{Kind: "network", Name: "Shipyard dashboard ingress", ParentID: LocalServerID, Data: raw})
	}
	if e != nil {
		return e
	}
	if e = c.EnsureNetwork(ctx, n.ID); e != nil {
		return e
	}
	n, e = c.Store.Resource(ctx, n.ID)
	if e != nil {
		return e
	}
	network, _ := model.Decode[model.Network](n)
	items, e := networkInventory(ctx, c.Local)
	if e != nil {
		return e
	}
	var actual DockerNetwork
	for _, item := range items {
		if item.ID == network.DockerID {
			actual = item
		}
	}
	ip, e := c.reserveIP(ctx, n, network, model.Release{ID: DashboardID, AppID: DashboardID, ServerID: LocalServerID}, "dashboard", 1, "", false, actual)
	if e != nil {
		return e
	}
	if ip == "" {
		return errors.New("dashboard ingress requires an IPv4 reservation")
	}
	connected := false
	for id, container := range actual.Containers {
		assigned := strings.Split(container.IPv4, "/")[0]
		if id == self.ID {
			if assigned != ip {
				return errors.New("dashboard ingress attachment differs from the saved reservation")
			}
			connected = true
		} else if assigned == ip {
			return errors.New("dashboard ingress address is occupied by another container")
		}
	}
	if !connected {
		if _, e = deploy.Output(ctx, c.Local, "docker", "network", "connect", "--ip", ip, network.DockerName, self.ID); e != nil {
			return e
		}
	}
	verified, e := networkInventory(ctx, c.Local)
	if e != nil {
		return e
	}
	found := false
	for _, item := range verified {
		if item.ID == network.DockerID {
			if container, ok := item.Containers[self.ID]; ok && strings.Split(container.IPv4, "/")[0] == ip {
				found = true
			}
		}
	}
	if !found {
		return errors.New("dashboard ingress attachment could not be verified")
	}
	data, _ := json.Marshal(dashboardTarget{LocalServerID, ip, network.Gateway, 8080})
	owner, err := c.Store.Resource(ctx, DashboardID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	_, e = c.Store.Save(ctx, DashboardID, model.ResourceInput{Kind: "system", Name: "Shipyard dashboard", Data: data, Version: owner.Version})
	return e
}
func (c *Controller) VerifyLocalIdentity(ctx context.Context, expected string) error {
	if c.Local == nil {
		return errors.New("local host is disabled")
	}
	actual, e := c.Local.Identity(ctx)
	if e != nil {
		return e
	}
	if actual != expected {
		return errors.New("supplied Docker identity does not match the local daemon")
	}
	r, e := c.Store.Resource(ctx, LocalServerID)
	if e != nil {
		return e
	}
	s, _ := model.Decode[model.Server](r)
	s.DaemonID = actual
	s.Connection = "local"
	raw, _ := json.Marshal(s)
	_, e = c.Store.Save(ctx, r.ID, model.ResourceInput{Kind: "server", Name: r.Name, Data: raw, Version: r.Version})
	if e == nil {
		e = c.Store.Audit(ctx, "system", "local.identity.verified", r.ID, "", nil)
	}
	return e
}
func (c *Controller) DashboardProxyPeer(ctx context.Context, address string) bool {
	host, _, e := net.SplitHostPort(address)
	if e != nil {
		return false
	}
	r, e := c.Store.Resource(ctx, DashboardID)
	if e != nil {
		return false
	}
	t, _ := model.Decode[dashboardTarget](r)
	return host == t.Gateway
}

// Ensure the transport can reach the backend before publishing a candidate.
func (c *Controller) dashboardHealth(ctx context.Context) error {
	r, e := c.Store.Resource(ctx, DashboardID)
	if e != nil {
		return e
	}
	t, _ := model.Decode[dashboardTarget](r)
	conn, e := c.Local.DialContext(ctx, "tcp", net.JoinHostPort(t.Address, fmt.Sprint(t.Port)))
	if e != nil {
		return e
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	_, e = io.WriteString(conn, "GET /healthz HTTP/1.0\r\nHost: localhost\r\n\r\n")
	if e != nil {
		return e
	}
	response, e := http.ReadResponse(bufio.NewReader(conn), nil)
	if e != nil {
		return e
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return errors.New("dashboard health check failed")
	}
	return nil
}
