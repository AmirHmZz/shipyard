package deploy

import (
	"encoding/json"
	"fmt"
	"shipyard/internal/model"
	"strconv"
)

// Check the saved container identities and resolved replica counts on every
// readiness pass, including applications without public routes or HTTP probes.
func requiredContainers(r model.Release, containers []container) error {
	ids := map[string]bool{}
	counts := map[string]int{}
	for _, c := range containers {
		ids[c.ID] = true
		counts[c.Config.Labels["com.docker.compose.service"]]++
	}
	if len(containers) == 0 {
		return fmt.Errorf("deployment has no containers")
	}
	for _, id := range r.Containers {
		if !ids[id] {
			return fmt.Errorf("expected container %s is missing", id)
		}
	}
	var config struct {
		Services map[string]struct {
			Scale  *int `json:"scale"`
			Deploy struct {
				Replicas *int `json:"replicas"`
			} `json:"deploy"`
			Profiles []string `json:"profiles"`
		} `json:"services"`
	}
	if r.Compose == "" {
		return nil
	}
	if err := json.Unmarshal([]byte(r.Compose), &config); err != nil {
		return fmt.Errorf("readiness Compose configuration: %w", err)
	}
	for name, service := range config.Services {
		active := len(service.Profiles) == 0
		for _, profile := range service.Profiles {
			for _, enabled := range r.App.Profiles {
				if profile == enabled || enabled == "*" {
					active = true
				}
			}
		}
		if !active {
			continue
		}
		expected := 1
		if service.Deploy.Replicas != nil {
			expected = *service.Deploy.Replicas
		}
		if service.Scale != nil {
			expected = *service.Scale
		}
		if counts[name] < expected {
			return fmt.Errorf("service %s has %d of %d expected containers", name, counts[name], expected)
		}
	}
	return nil
}

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
