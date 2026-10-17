package proxy

import (
	"fmt"
	"net"
	"net/netip"
	"shipyard/internal/model"
	"strings"
)

const Image = "haproxy:3.4-alpine"

// Bindings contains explicit overrides only. Missing frontends inherit defaults.
type Bindings map[string][]string

type Options struct {
	Challenge *Challenge
	IPv6      bool
	Bindings  Bindings
}
type Challenge struct {
	Domains []string
	Target  model.Target
}

func DefaultAddresses(ipv6 bool) []string {
	addresses := []string{"0.0.0.0"}
	if ipv6 {
		addresses = append(addresses, "::")
	}
	return addresses
}

// HTTPSProbeAddresses reaches the configured listener from the host namespace.
// Wildcard binds are dialed through loopback; explicit binds retain their IP.
func HTTPSProbeAddresses(bindings Bindings) []string {
	addresses := bindings["web"]
	if len(addresses) == 0 {
		addresses = DefaultAddresses(false)
	}
	targets := make([]string, 0, len(addresses))
	for _, address := range addresses {
		switch address {
		case "0.0.0.0":
			address = "127.0.0.1"
		case "::":
			address = "::1"
		}
		targets = append(targets, net.JoinHostPort(address, "443"))
	}
	return targets
}

func NormalizeBindings(input Bindings) (Bindings, error) {
	out := Bindings{}
	for id, addresses := range input {
		if len(addresses) == 0 {
			return nil, fmt.Errorf("frontend %s requires at least one IP address", id)
		}
		seen := map[string]bool{}
		out[id] = []string{}
		for _, raw := range addresses {
			address, err := netip.ParseAddr(strings.TrimSpace(raw))
			if err != nil || address.Zone() != "" {
				return nil, fmt.Errorf("frontend %s: enter an IPv4 or IPv6 address without a port, hostname, or CIDR range", id)
			}
			value := address.Unmap().String()
			if seen[value] {
				return nil, fmt.Errorf("frontend %s: duplicate IP address %s", id, value)
			}
			seen[value] = true
			out[id] = append(out[id], value)
		}
	}
	return out, nil
}
