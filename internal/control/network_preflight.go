package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"net/netip"
	"shipyard/internal/deploy"
	"shipyard/internal/model"
	"strings"
)

// Validate everything observable before stopping a generation that needs
// recreate. Docker still arbitrates allocation races at connection time.
func (c *Controller) preflightNetworks(ctx context.Context, r model.Release) error {
	current, e := c.Store.Resource(ctx, r.AppID)
	if e != nil {
		return e
	}
	if e = c.ValidateNetworkSettings(ctx, current, r.App); e != nil {
		return e
	}
	a, e := model.Decode[model.App](current)
	if e != nil {
		return e
	}
	before, _ := json.Marshal(a.PublishedPorts)
	after, _ := json.Marshal(r.App.PublishedPorts)
	if len(a.PublishedPorts)+len(r.App.PublishedPorts) > 0 && string(before) != string(after) {
		return errors.New("published-port authorization changed; deploy current settings")
	}
	var config map[string]any
	if e = json.Unmarshal([]byte(r.Compose), &config); e != nil {
		return e
	}
	if e = c.validateRenderedNetworks(ctx, r, config); e != nil {
		return e
	}
	var inventory []DockerNetwork
	client, _, e := c.connect(ctx, r.ServerID)
	if e != nil {
		return e
	}
	defer client.Close()
	for service, settings := range r.App.Networking {
		for _, connection := range settings.Connections {
			if connection.IPv4 == "" && connection.IPv6 == "" {
				continue
			}
			if services, ok := config["services"].(map[string]any); ok {
				serviceConfig, _ := services[service].(map[string]any)
				if scale, ok := serviceConfig["scale"].(float64); ok && scale != 1 {
					return errors.New("a fixed service address requires one container")
				}
				deployment, _ := serviceConfig["deploy"].(map[string]any)
				if replicas, ok := deployment["replicas"].(float64); ok && replicas != 1 {
					return errors.New("a fixed service address requires one container")
				}
			}
			if inventory == nil {
				inventory, e = networkInventory(ctx, client)
				if e != nil {
					return e
				}
			}
			resource, e := c.Store.Resource(ctx, connection.NetworkID)
			if e != nil {
				return e
			}
			network, e := model.Decode[model.Network](resource)
			if e != nil {
				return e
			}
			for family, wanted := range []string{connection.IPv4, connection.IPv6} {
				if wanted == "" {
					continue
				}
				subnet, dynamic, gateway := network.Subnet, network.DynamicRange, network.Gateway
				if family == 1 {
					subnet, dynamic, gateway = network.IPv6Subnet, network.IPv6DynamicRange, network.IPv6Gateway
				}
				ip, e := netip.ParseAddr(wanted)
				if e != nil {
					return e
				}
				prefix, e := netip.ParsePrefix(subnet)
				if e != nil {
					return e
				}
				pool, e := netip.ParsePrefix(dynamic)
				if e != nil || !prefix.Contains(ip) || pool.Contains(ip) || ip == prefix.Masked().Addr() || ip.String() == gateway || ip.Is4() && !prefix.Contains(ip.Next()) {
					return errors.New("fixed address must be in the network's static allocation range")
				}
				var raw []byte
				err := c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", "network-lease:"+resource.ID+":"+ip.String()).Scan(&raw)
				if err != nil && !errors.Is(err, pgx.ErrNoRows) {
					return err
				}
				if err == nil {
					var lease ipLease
					if e = json.Unmarshal(raw, &lease); e != nil {
						return e
					}
					if lease.Application != r.AppID || lease.Service != service {
						return fmt.Errorf("address %s is reserved by another service", ip)
					}
				}
				for _, actual := range inventory {
					if actual.ID != network.DockerID {
						continue
					}
					for id, container := range actual.Containers {
						address := container.IPv4
						if family == 1 {
							address = container.IPv6
						}
						if strings.HasPrefix(address, ip.String()+"/") {
							owner, e := deploy.Output(ctx, client, "docker", "inspect", "--format", "{{index .Config.Labels \"shipyard.app\"}}", id)
							if e != nil {
								return e
							}
							if owner != r.AppID {
								return fmt.Errorf("address %s is already allocated by Docker", ip)
							}
						}
					}
				}
			}
		}
	}
	return nil
}
