package deploy

import (
	"fmt"
	"shipyard/internal/model"
	"strconv"
)

type readinessProbe struct {
	model.Target
	Path string
}

// Readiness endpoints stay separate from proxy targets, including private services.
func httpReadinessProbes(r model.Release, containers []container) ([]readinessProbe, error) {
	probes := []readinessProbe{}
	for _, check := range r.App.EffectiveReadiness(r.Routes) {
		found := false
		for _, ctr := range containers {
			if ctr.Config.Labels["com.docker.compose.service"] != check.Service {
				continue
			}
			replica, _ := strconv.Atoi(ctr.Config.Labels["com.docker.compose.container-number"])
			address, networkID := "", ""
			for _, ep := range r.Networks {
				if ep.Service != check.Service || ep.Replica != replica || !ep.Ingress {
					continue
				}
				actual, ok := ctr.NetworkSettings.Networks[ep.DockerName]
				if !ok || ep.IPv4 != "" && actual.IPAddress != ep.IPv4 || ep.IPv6 != "" && actual.GlobalIPv6Address != ep.IPv6 {
					continue
				}
				address = actual.IPAddress
				if address == "" {
					address = actual.GlobalIPv6Address
				}
				networkID = ep.NetworkID
				break
			}
			if address == "" {
				return nil, fmt.Errorf("HTTP readiness service %s has no reserved endpoint", check.Service)
			}
			probes = append(probes, readinessProbe{Target: model.Target{Service: check.Service, Container: ctr.ID, Address: address, Port: check.Port, NetworkID: networkID}, Path: check.Path})
			found = true
		}
		if !found {
			return nil, fmt.Errorf("HTTP readiness service %s has no containers", check.Service)
		}
	}
	return probes, nil
}
