package control

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/netip"
	"strings"

	"github.com/google/uuid"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

type DockerNetwork struct {
	ID         string            `json:"Id"`
	Name       string            `json:"Name"`
	Driver     string            `json:"Driver"`
	EnableIPv6 bool              `json:"EnableIPv6"`
	Labels     map[string]string `json:"Labels"`
	IPAM       struct {
		Config []struct {
			Subnet  string `json:"Subnet"`
			IPRange string `json:"IPRange"`
			Gateway string `json:"Gateway"`
		}
	} `json:"IPAM"`
	Containers map[string]struct {
		Name string `json:"Name"`
		IPv4 string `json:"IPv4Address"`
		IPv6 string `json:"IPv6Address"`
	} `json:"Containers"`
}

func networkInventory(ctx context.Context, r remote.Executor) ([]DockerNetwork, error) {
	ids, err := deploy.Output(ctx, r, "docker", "network", "ls", "-q")
	if err != nil {
		return nil, err
	}
	if ids == "" {
		return []DockerNetwork{}, nil
	}
	out, err := deploy.Output(ctx, r, append([]string{"docker", "network", "inspect"}, strings.Fields(ids)...)...)
	if err != nil {
		return nil, err
	}
	var networks []DockerNetwork
	err = json.Unmarshal([]byte(out), &networks)
	return networks, err
}
func (c *Controller) NetworkInventory(ctx context.Context, server string) ([]DockerNetwork, error) {
	client, _, err := c.connect(ctx, server)
	if err != nil {
		return nil, err
	}
	defer client.Close()
	return networkInventory(ctx, client)
}
func networkData(n DockerNetwork, spec model.Network) model.Network {
	spec.DockerID = n.ID
	spec.DockerName = n.Name
	spec.EnableIPv6 = n.EnableIPv6
	spec.Status = "ready"
	spec.Error = ""
	for _, p := range n.IPAM.Config {
		prefix, e := netip.ParsePrefix(p.Subnet)
		if e != nil {
			continue
		}
		if prefix.Addr().Is4() {
			spec.Subnet = p.Subnet
			spec.DynamicRange = p.IPRange
			spec.Gateway = p.Gateway
		} else {
			spec.IPv6Subnet = p.Subnet
			spec.IPv6DynamicRange = p.IPRange
			spec.IPv6Gateway = p.Gateway
		}
	}
	return spec
}
func (c *Controller) writeNetwork(ctx context.Context, r model.Resource, s model.Network) error {
	b, _ := json.Marshal(s)
	_, e := c.Store.Pool.Exec(ctx, "UPDATE resources SET data=$2,updated_at=now() WHERE id=$1", r.ID, b)
	return e
}
func (c *Controller) EnsureNetwork(ctx context.Context, id string) (result error) {
	r, e := c.Store.Resource(ctx, id)
	if e != nil {
		return e
	}
	s, e := model.Decode[model.Network](r)
	if e != nil {
		return e
	}
	unlock, e := c.lock(ctx, "networks:"+s.ServerID)
	if e != nil {
		return e
	}
	defer unlock()
	defer func() {
		if result != nil {
			s.Status = "failed"
			s.Error = result.Error()
			_ = c.writeNetwork(context.WithoutCancel(ctx), r, s)
		}
	}()
	client, _, e := c.connect(ctx, s.ServerID)
	if e != nil {
		return e
	}
	defer client.Close()
	inventory, e := networkInventory(ctx, client)
	if e != nil {
		return e
	}
	for _, n := range inventory {
		if n.ID == s.DockerID || n.Labels["shipyard.network"] == id {
			if n.Driver != "bridge" || n.Name == "bridge" {
				return errors.New("only user-defined bridge networks are supported")
			}
			s = networkData(n, s)
			if n.Labels["shipyard.network"] != id {
				s.Managed = false
			}
			return c.writeNetwork(ctx, r, s)
		}
	}
	if s.DockerID != "" {
		return errors.New("registered external network is missing")
	}
	if s.Subnet == "" {
		occupied := []netip.Prefix{}
		for _, n := range inventory {
			for _, p := range n.IPAM.Config {
				if prefix, err := netip.ParsePrefix(p.Subnet); err == nil {
					occupied = append(occupied, prefix)
				}
			}
		}
		// Avoid connected/VPN routes as well as Docker's address pools.
		if routes, err := deploy.Output(ctx, client, "ip", "route"); err == nil {
			for _, line := range strings.Split(routes, "\n") {
				fields := strings.Fields(line)
				if len(fields) > 0 {
					if p, err := netip.ParsePrefix(fields[0]); err == nil && p.Bits() > 0 {
						occupied = append(occupied, p)
					}
				}
			}
		}
		for i := 0; i < 4096; i++ {
			candidate := netip.MustParsePrefix(fmt.Sprintf("172.%d.%d.0/24", 16+i/256, i%256))
			free := true
			for _, p := range occupied {
				if candidate.Overlaps(p) {
					free = false
					break
				}
			}
			if free {
				s.Subnet = candidate.String()
				break
			}
		}
		if s.Subnet == "" {
			return errors.New("no non-overlapping automatic subnet; specify a custom subnet")
		}
	}
	p, e := netip.ParsePrefix(s.Subnet)
	if e != nil || !p.Addr().Is4() || p.Bits() > 28 {
		return errors.New("IPv4 subnet must have at least 16 addresses")
	}
	if s.DynamicRange == "" {
		s.DynamicRange = upperHalf(p).String()
	}
	if s.EnableIPv6 && s.IPv6Subnet == "" {
		hash := sha256.Sum256([]byte(id))
		s.IPv6Subnet = fmt.Sprintf("fd%02x:%02x%02x:%02x%02x::/64", hash[0], hash[1], hash[2], hash[3], hash[4])
	}
	args := []string{"docker", "network", "create", "--driver", "bridge", "--label", "shipyard.network=" + id, "--subnet", s.Subnet, "--ip-range", s.DynamicRange}
	if s.Gateway != "" {
		args = append(args, "--gateway", s.Gateway)
	}
	if s.EnableIPv6 {
		p6, err := netip.ParsePrefix(s.IPv6Subnet)
		if err != nil || !p6.Addr().Is6() || p6.Bits() > 120 {
			return errors.New("invalid IPv6 subnet")
		}
		if s.IPv6DynamicRange == "" {
			s.IPv6DynamicRange = upperHalf(p6).String()
		}
		args = append(args, "--ipv6", "--subnet", s.IPv6Subnet, "--ip-range", s.IPv6DynamicRange)
		if s.IPv6Gateway != "" {
			args = append(args, "--gateway", s.IPv6Gateway)
		}
	}
	s.DockerName = "shipyard-" + id
	if _, e = deploy.Output(ctx, client, append(args, s.DockerName)...); e != nil {
		return e
	}
	inventory, e = networkInventory(ctx, client)
	if e != nil {
		return e
	}
	for _, n := range inventory {
		if n.Labels["shipyard.network"] == id {
			s = networkData(n, s)
			s.Managed = true
			return c.writeNetwork(ctx, r, s)
		}
	}
	return errors.New("created network could not be verified")
}
func upperHalf(p netip.Prefix) netip.Prefix {
	p = p.Masked()
	a := p.Addr().As16()
	bit := p.Bits()
	if p.Addr().Is4() {
		bit += 96
	}
	a[bit/8] |= 1 << uint(7-bit%8)
	ip := netip.AddrFrom16(a)
	if p.Addr().Is4() {
		ip = ip.Unmap()
	}
	return netip.PrefixFrom(ip, p.Bits()+1)
}
func (c *Controller) DeleteNetwork(ctx context.Context, r model.Resource) error {
	if Protected(r.ID) {
		return errors.New("system ingress networks cannot be deleted")
	}
	s, e := model.Decode[model.Network](r)
	if e != nil {
		return e
	}
	if s.IngressApp != "" {
		return errors.New("ingress networks are managed with their application")
	}
	unlock, e := c.lock(ctx, "networks:"+s.ServerID)
	if e != nil {
		return e
	}
	defer unlock()
	apps, e := c.Store.Resources(ctx, "application")
	if e != nil {
		return e
	}
	for _, app := range apps {
		a, _ := model.Decode[model.App](app)
		for _, service := range a.Networking {
			for _, connection := range service.Connections {
				if connection.NetworkID == r.ID {
					return errors.New("network is still referenced by an application")
				}
			}
		}
	}
	rows, e := c.Store.Pool.Query(ctx, "SELECT id FROM releases")
	if e != nil {
		return e
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return e
		}
		ids = append(ids, id)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	for _, id := range ids {
		release, e := c.Store.Release(ctx, id)
		if e != nil {
			return e
		}
		for _, service := range release.App.Networking {
			for _, connection := range service.Connections {
				if connection.NetworkID == r.ID {
					return errors.New("network is referenced by a retained release; remove its application or prune the release first")
				}
			}
		}
	}
	return c.removeNetwork(ctx, r, s)
}
func (c *Controller) removeNetwork(ctx context.Context, r model.Resource, s model.Network) error {
	client, _, e := c.connect(ctx, s.ServerID)
	if e != nil {
		return e
	}
	defer client.Close()
	inventory, e := networkInventory(ctx, client)
	if e != nil {
		return e
	}
	for _, n := range inventory {
		if n.ID == s.DockerID || n.Labels["shipyard.network"] == r.ID {
			if len(n.Containers) > 0 {
				return errors.New("network still has attached containers")
			}
			if s.Managed {
				if n.Labels["shipyard.network"] != r.ID {
					return errors.New("refusing to delete an externally owned network")
				}
				if _, e = deploy.Output(ctx, client, "docker", "network", "rm", n.ID); e != nil {
					return e
				}
			}
		}
	}
	tx, e := c.Store.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "DELETE FROM settings WHERE starts_with(key,$1)", "network-lease:"+r.ID+":"); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "DELETE FROM resources WHERE id=$1", r.ID); e != nil {
		return e
	}
	return tx.Commit(ctx)
}

type ipLease struct {
	Release     string `json:"release"`
	Application string `json:"application"`
	Service     string `json:"service"`
	Replica     int    `json:"replica"`
	IP          string `json:"ip"`
}

func (c *Controller) reserveIP(ctx context.Context, n model.Resource, s model.Network, r model.Release, service string, replica int, wanted string, v6 bool, inventory DockerNetwork) (string, error) {
	subnet, dynamic, gateway := s.Subnet, s.DynamicRange, s.Gateway
	if v6 {
		subnet, dynamic, gateway = s.IPv6Subnet, s.IPv6DynamicRange, s.IPv6Gateway
	}
	if subnet == "" {
		if wanted != "" {
			return "", errors.New("network does not support this address family")
		}
		return "", nil
	}
	p, e := netip.ParsePrefix(subnet)
	if e != nil {
		return "", e
	}
	pool, poolErr := netip.ParsePrefix(dynamic)
	// A static range outside Docker's automatic allocator is necessary for a
	// reservation to survive container replacement on externally shared networks.
	if poolErr != nil {
		if wanted != "" {
			return "", errors.New("fixed addresses require a network with a separate dynamic IP range")
		}
		return "", nil
	}
	occupied := map[string]bool{}
	for _, c := range inventory.Containers {
		for _, raw := range []string{c.IPv4, c.IPv6} {
			if a, err := netip.ParsePrefix(raw); err == nil {
				occupied[a.Addr().String()] = true
			}
		}
	}
	tx, e := c.Store.Pool.Begin(ctx)
	if e != nil {
		return "", e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", "ipam:"+n.ID); e != nil {
		return "", e
	}
	prefix := "network-lease:" + n.ID + ":"
	rows, e := tx.Query(ctx, "SELECT value FROM settings WHERE starts_with(key,$1)", prefix)
	if e != nil {
		return "", e
	}
	leases := map[string]ipLease{}
	for rows.Next() {
		var raw []byte
		if e = rows.Scan(&raw); e != nil {
			rows.Close()
			return "", e
		}
		var l ipLease
		if e = json.Unmarshal(raw, &l); e != nil {
			rows.Close()
			return "", e
		}
		leases[l.IP] = l
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return "", e
	}
	for ip, l := range leases {
		if l.Release == r.ID && l.Service == service && l.Replica == replica && netip.MustParseAddr(ip).Is6() == v6 {
			if wanted == "" || wanted == ip {
				return ip, tx.Commit(ctx)
			}
		}
	}
	available := func(ip netip.Addr) bool {
		if ip.Is4() && !p.Contains(ip.Next()) {
			return false
		}
		if !p.Contains(ip) || pool.Contains(ip) || ip.String() == gateway || ip == p.Masked().Addr() {
			return false
		}
		if l, ok := leases[ip.String()]; ok {
			return wanted != "" && l.Application == r.AppID && l.Service == service
		}
		return !occupied[ip.String()]
	}
	var ip netip.Addr
	if wanted != "" {
		ip, e = netip.ParseAddr(wanted)
		if e != nil || ip.Is6() != v6 || !available(ip) {
			return "", errors.New("reserved address is outside the static pool or already in use")
		}
	} else {
		ip = p.Masked().Addr().Next().Next()
		for i := 0; i < 65536 && ip.IsValid() && p.Contains(ip); i++ {
			if available(ip) {
				break
			}
			ip = ip.Next()
		}
		if !ip.IsValid() || !available(ip) {
			return "", errors.New("network static address pool is exhausted")
		}
	}
	lease := ipLease{Release: r.ID, Application: r.AppID, Service: service, Replica: replica, IP: ip.String()}
	raw, _ := json.Marshal(lease)
	if _, e = tx.Exec(ctx, "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", prefix+ip.String(), raw); e != nil {
		return "", e
	}
	return ip.String(), tx.Commit(ctx)
}
func (c *Controller) prepareNetworks(ctx context.Context, r *model.Release, containers []model.NetworkContainer) error {
	current, err := c.Store.Resource(ctx, r.AppID)
	if err != nil {
		return err
	}
	app, err := model.Decode[model.App](current)
	if err != nil {
		return err
	}
	r.TeamID = current.TeamID
	approved, _ := json.Marshal(app.PublishedPorts)
	requested, _ := json.Marshal(r.App.PublishedPorts)
	if len(app.PublishedPorts)+len(r.App.PublishedPorts) > 0 && string(approved) != string(requested) {
		return errors.New("published-port authorization changed; deploy the current settings")
	}
	// The application lock serializes deployment, attachment changes and deletion.
	resources, e := c.Store.Resources(ctx, "network")
	if e != nil {
		return e
	}
	var ingress model.Resource
	routed := map[string]bool{}
	for _, route := range r.Routes {
		v, e := model.Decode[model.Route](route)
		if e != nil {
			return e
		}
		service := v.Service
		if service == "" {
			service = "app"
		}
		routed[service] = true
	}
	if len(routed) > 0 {
		for _, n := range resources {
			s, _ := model.Decode[model.Network](n)
			if s.IngressApp == r.AppID {
				ingress = n
				break
			}
		}
		if ingress.ID == "" {
			spec := model.Network{ServerID: r.ServerID, Managed: true, IngressApp: r.AppID}
			raw, _ := json.Marshal(spec)
			ingress, e = c.Store.Save(ctx, "", model.ResourceInput{Kind: "network", Name: "Ingress · " + r.AppID, ParentID: r.ServerID, Data: raw})
			if e != nil {
				return e
			}
		}
		if e = c.EnsureNetwork(ctx, ingress.ID); e != nil {
			return e
		}
		ingress, e = c.Store.Resource(ctx, ingress.ID)
		if e != nil {
			return e
		}
	}
	client, _, e := c.connect(ctx, r.ServerID)
	if e != nil {
		return e
	}
	defer client.Close()
	inventory, e := networkInventory(ctx, client)
	if e != nil {
		return e
	}
	lookup := map[string]model.Resource{}
	for _, n := range resources {
		lookup[n.ID] = n
	}
	if ingress.ID != "" {
		lookup[ingress.ID] = ingress
	}
	counts := map[string]int{}
	for _, ctr := range containers {
		counts[ctr.Service]++
	}
	endpoints := []model.NetworkEndpoint{}
	for _, ctr := range containers {
		attachments := append([]model.NetworkAttachment(nil), r.App.Networking[ctr.Service].Connections...)
		if routed[ctr.Service] {
			attachments = append(attachments, model.NetworkAttachment{NetworkID: ingress.ID})
		}
		for _, a := range attachments {
			n, ok := lookup[a.NetworkID]
			if !ok {
				return errors.New("configured network no longer exists")
			}
			s, e := model.Decode[model.Network](n)
			if e != nil {
				return e
			}
			if s.ServerID != r.ServerID || s.Status != "ready" {
				return errors.New("network must be ready on the application's server")
			}
			if s.IngressApp != "" && s.IngressApp != r.AppID {
				return errors.New("network belongs to another application or protected system resource")
			}
			if s.IngressApp == "" && !c.Store.TeamGranted(ctx, rTeam(r), n.ID) {
				return errors.New("network is not granted to the application's team")
			}
			if (a.IPv4 != "" || a.IPv6 != "") && counts[ctr.Service] != 1 {
				return errors.New("a fixed service address requires one container; remove the reservation to use replicas")
			}
			var actual DockerNetwork
			for _, item := range inventory {
				if item.ID == s.DockerID {
					actual = item
					break
				}
			}
			if actual.ID == "" {
				return errors.New("Docker network is missing")
			}
			ep := model.NetworkEndpoint{Service: ctr.Service, Replica: ctr.Replica, NetworkID: n.ID, DockerName: s.DockerName, Ingress: s.IngressApp != ""}
			if ep.Ingress || a.IPv4 != "" {
				ep.IPv4, e = c.reserveIP(ctx, n, s, *r, ctr.Service, ctr.Replica, a.IPv4, false, actual)
				if e != nil {
					return e
				}
			}
			if s.EnableIPv6 && (ep.Ingress || a.IPv6 != "") {
				ep.IPv6, e = c.reserveIP(ctx, n, s, *r, ctr.Service, ctr.Replica, a.IPv6, true, actual)
				if e != nil {
					return e
				}
			}
			// Connect is idempotent on recovery: verify an existing endpoint before
			// touching it, and never disconnect an occupied fixed address silently.
			var connected bool
			if output, err := deploy.Output(ctx, client, "docker", "inspect", "--format", "{{json .NetworkSettings.Networks}}", ctr.ID); err == nil {
				var configured map[string]struct {
					IPAddress  string
					IPAMConfig *struct {
						IPv4Address string
						IPv6Address string
					}
				}
				if json.Unmarshal([]byte(output), &configured) == nil {
					if existing, ok := configured[s.DockerName]; ok {
						connected = true
						assigned := existing.IPAddress
						if assigned == "" && existing.IPAMConfig != nil {
							assigned = existing.IPAMConfig.IPv4Address
						}
						if ep.IPv4 != "" && assigned != ep.IPv4 {
							return errors.New("existing container network differs from its IP reservation")
						}
					}
				}
			}
			for id, existing := range actual.Containers {
				if id == ctr.ID {
					connected = true
					if ep.IPv4 != "" && !strings.HasPrefix(existing.IPv4, ep.IPv4+"/") {
						return errors.New("container network address differs from its reservation")
					}
				}
			}
			if !connected {
				args := []string{"docker", "network", "connect"}
				if ep.IPv4 != "" {
					args = append(args, "--ip", ep.IPv4)
				}
				if ep.IPv6 != "" {
					args = append(args, "--ip6", ep.IPv6)
				}
				if h := r.App.Networking[ctr.Service].Hostname; h != "" {
					args = append(args, "--alias", h)
				}
				args = append(args, s.DockerName, ctr.ID)
				if _, e = deploy.Output(ctx, client, args...); e != nil {
					return e
				}
			}
			endpoints = append(endpoints, ep)
		}
	}
	r.Networks = endpoints
	return c.Store.SaveReleaseNetworks(ctx, *r)
}
func rTeam(r *model.Release) string { return r.TeamID }
func (c *Controller) ReleaseNetworkLeases(ctx context.Context, release string) error {
	_, e := c.Store.Pool.Exec(ctx, "DELETE FROM settings WHERE starts_with(key,'network-lease:') AND value->>'release'=$1", release)
	return e
}

func (c *Controller) validateRenderedNetworks(ctx context.Context, r model.Release, config map[string]any) error {
	networks, _ := config["networks"].(map[string]any)
	resources, e := c.Store.Resources(ctx, "network")
	if e != nil {
		return e
	}
	app, e := c.Store.Resource(ctx, r.AppID)
	if e != nil {
		return e
	}
	for key, raw := range networks {
		n, _ := raw.(map[string]any)
		external, _ := n["external"].(bool)
		if !external {
			continue
		}
		name, _ := n["name"].(string)
		if name == "" {
			name = key
		}
		allowed := false
		for _, resource := range resources {
			s, _ := model.Decode[model.Network](resource)
			if s.ServerID == r.ServerID && s.DockerName == name && s.IngressApp == "" && s.Status == "ready" && c.Store.TeamGranted(ctx, app.TeamID, resource.ID) {
				allowed = true
			}
		}
		if !allowed {
			return fmt.Errorf("external network %s must be registered and granted to the application's team", name)
		}
	}
	services, _ := config["services"].(map[string]any)
	for _, raw := range r.Routes {
		route, e := model.Decode[model.Route](raw)
		if e != nil {
			return e
		}
		name := route.Service
		if name == "" {
			name = "app"
		}
		if _, ok := services[name]; !ok {
			return fmt.Errorf("route references missing Compose service %s", name)
		}
	}
	for name, s := range r.App.Networking {
		if _, ok := services[name]; !ok && (s.Hostname != "" || len(s.Connections) > 0) {
			return fmt.Errorf("network settings reference missing service %s", name)
		}
	}
	for name := range r.App.PublishedPorts {
		if _, ok := services[name]; !ok {
			return fmt.Errorf("published ports reference missing service %s", name)
		}
	}
	return nil
}

func (c *Controller) cleanupIngress(ctx context.Context, app string) error {
	resources, e := c.Store.Resources(ctx, "network")
	if e != nil {
		return e
	}
	for _, r := range resources {
		s, _ := model.Decode[model.Network](r)
		if s.IngressApp == app {
			unlock, e := c.lock(ctx, "networks:"+s.ServerID)
			if e != nil {
				return e
			}
			e = c.removeNetwork(ctx, r, s)
			unlock()
			if e != nil {
				return e
			}
		}
	}
	return nil
}

// NewNetwork registers only a verified user-defined bridge, or creates a
// durable creation job. Runtime ownership is always checked against Docker.
func (c *Controller) NewNetwork(ctx context.Context, server, name, dockerID string, s model.Network) (model.Resource, error) {
	s.ServerID = server
	s.Managed = dockerID == ""
	s.DockerID = dockerID
	s.IngressApp = ""
	s.Status = "queued"
	s.Error = ""
	s.DockerName = ""
	if dockerID != "" {
		items, e := c.NetworkInventory(ctx, server)
		if e != nil {
			return model.Resource{}, e
		}
		found := false
		for _, n := range items {
			if n.ID == dockerID && n.Driver == "bridge" && n.Name != "bridge" && n.Labels["shipyard.network"] == "" {
				s = networkData(n, s)
				found = true
			}
		}
		if !found {
			return model.Resource{}, errors.New("select an existing external user-defined bridge")
		}
	}
	existing, e := c.Store.Resources(ctx, "network")
	if e != nil {
		return model.Resource{}, e
	}
	for _, r := range existing {
		n, _ := model.Decode[model.Network](r)
		if dockerID != "" && n.DockerID == dockerID && n.ServerID == server {
			return model.Resource{}, errors.New("network is already registered")
		}
	}
	raw, _ := json.Marshal(s)
	in := model.ResourceInput{Kind: "network", Name: name, ParentID: server, Data: raw}
	if e = model.Validate(in); e != nil {
		return model.Resource{}, e
	}
	r, e := c.Store.Save(ctx, "", in)
	if e == nil && s.Status != "ready" {
		e = c.Store.Enqueue(ctx, "network-create", r.ID, "network-create:"+uuid.NewString(), nil)
	}
	return r, e
}
func RequiresRecreate(app model.App) bool {
	if app.Worker || app.Engine == "compose" || len(app.PublishedPorts) > 0 {
		return true
	}
	for _, s := range app.Networking {
		for _, n := range s.Connections {
			if n.IPv4 != "" || n.IPv6 != "" {
				return true
			}
		}
	}
	return false
}
