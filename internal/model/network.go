package model

import (
	"errors"
	"net/netip"
	"regexp"
	"strings"
)

type Network struct {
	ServerID         string `json:"serverId"`
	DockerID         string `json:"dockerId,omitempty"`
	DockerName       string `json:"dockerName,omitempty"`
	Managed          bool   `json:"managed"`
	IngressApp       string `json:"ingressApp,omitempty"`
	Subnet           string `json:"subnet,omitempty"`
	DynamicRange     string `json:"dynamicRange,omitempty"`
	Gateway          string `json:"gateway,omitempty"`
	IPv6Subnet       string `json:"ipv6Subnet,omitempty"`
	EnableIPv6       bool   `json:"enableIPv6"`
	IPv6DynamicRange string `json:"ipv6DynamicRange,omitempty"`
	IPv6Gateway      string `json:"ipv6Gateway,omitempty"`
	Status           string `json:"status,omitempty"`
	Error            string `json:"error,omitempty"`
}
type NetworkContainer struct {
	ID      string
	Service string
	Replica int
}
type NetworkEndpoint struct {
	Service    string `json:"service"`
	Replica    int    `json:"replica"`
	NetworkID  string `json:"networkId"`
	DockerName string `json:"dockerName"`
	IPv4       string `json:"ipv4,omitempty"`
	IPv6       string `json:"ipv6,omitempty"`
	Ingress    bool   `json:"ingress"`
}
type NetworkAttachment struct {
	NetworkID string `json:"networkId"`
	IPv4      string `json:"ipv4,omitempty"`
	IPv6      string `json:"ipv6,omitempty"`
}
type ServiceNetworking struct {
	Hostname    string              `json:"hostname,omitempty"`
	Connections []NetworkAttachment `json:"connections"`
}
type PublishedPort struct {
	Host      string `json:"host"`
	Published int    `json:"published"`
	Target    int    `json:"target"`
	Protocol  string `json:"protocol"`
}

var hostname = regexp.MustCompile(`^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$`)

func ValidateNetworking(app App) error {
	for _, s := range app.Networking {
		if s.Hostname != "" && !hostname.MatchString(s.Hostname) {
			return errors.New("invalid container hostname")
		}
		if s.Hostname != "" {
			for _, label := range strings.Split(s.Hostname, ".") {
				if len(label) < 1 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
					return errors.New("invalid hostname label")
				}
			}
		}
		seen := map[string]bool{}
		for _, a := range s.Connections {
			if a.NetworkID == "" || seen[a.NetworkID] {
				return errors.New("select each network only once")
			}
			seen[a.NetworkID] = true
			for i, raw := range []string{a.IPv4, a.IPv6} {
				if raw != "" {
					ip, e := netip.ParseAddr(raw)
					if e != nil || ip.Is4() != (i == 0) || ip.IsUnspecified() || ip.IsMulticast() {
						return errors.New("invalid reserved IP address")
					}
				}
			}
		}
	}
	for _, ports := range app.PublishedPorts {
		for _, p := range ports {
			if _, err := netip.ParseAddr(p.Host); err != nil {
				return errors.New("published ports require an explicit host IP")
			}
			if p.Published < 1 || p.Published > 65535 || p.Target < 1 || p.Target > 65535 || p.Protocol != "tcp" && p.Protocol != "udp" {
				return errors.New("invalid published port")
			}
			if p.Published == 22 || p.Published == 80 || p.Published == 443 {
				return errors.New("ports 22, 80 and 443 are reserved")
			}
		}
	}
	return nil
}
