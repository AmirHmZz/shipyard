package model

import (
	"errors"
	"fmt"
	"strings"
)

type HTTPReadinessCheck struct {
	Service string `json:"service"`
	Port    int    `json:"port"`
	Path    string `json:"path"`
}

type PreviewRouting struct {
	Mode    string `json:"mode"`
	Service string `json:"service,omitempty"`
	Port    int    `json:"port,omitempty"`
}

// A non-nil empty list explicitly disables legacy HTTP readiness.
func (a App) EffectiveReadiness(routes []Resource) []HTTPReadinessCheck {
	if a.ReadinessChecks != nil {
		return a.ReadinessChecks
	}
	checks := []HTTPReadinessCheck{}
	if a.Port <= 0 || a.HealthPath == "" {
		return checks
	}
	seen := map[string]bool{}
	for _, resource := range routes {
		route, err := Decode[Route](resource)
		if err != nil || route.TargetPort != a.Port {
			continue
		}
		service := route.Service
		if service == "" {
			service = "app"
		}
		if !seen[service] {
			checks = append(checks, HTTPReadinessCheck{Service: service, Port: a.Port, Path: a.HealthPath})
			seen[service] = true
		}
	}
	return checks
}

func (a App) EffectivePreviewRouting(routes []Resource) PreviewRouting {
	if a.PreviewRouting != nil {
		return *a.PreviewRouting
	}
	for _, resource := range routes {
		route, err := Decode[Route](resource)
		if err == nil && route.Protocol != "tcp" {
			return PreviewRouting{Mode: "inherit"}
		}
	}
	if a.Port > 0 {
		return PreviewRouting{Mode: "target", Service: "app", Port: a.Port}
	}
	return PreviewRouting{Mode: "private"}
}

func ValidateApplicationChecks(a App) error {
	seen := map[HTTPReadinessCheck]bool{}
	for _, check := range a.ReadinessChecks {
		if check.Service == "" || strings.ContainsAny(check.Service, " \t\r\n") || check.Port < 1 || check.Port > 65535 || !strings.HasPrefix(check.Path, "/") || strings.ContainsAny(check.Path, "\r\n") {
			return errors.New("HTTP readiness requires a service, port 1–65535 and path beginning with /")
		}
		if seen[check] {
			return errors.New("duplicate HTTP readiness check")
		}
		seen[check] = true
	}
	if p := a.PreviewRouting; p != nil {
		switch p.Mode {
		case "inherit", "private":
		case "target":
			if p.Service == "" || strings.ContainsAny(p.Service, " \t\r\n") || p.Port < 1 || p.Port > 65535 {
				return errors.New("preview target requires a service and port 1–65535")
			}
		default:
			return errors.New("preview routing must inherit routes, specify a target, or remain private")
		}
	}
	return nil
}

func (a App) ValidateReadinessServices(routes []Resource, services map[string]any) error {
	for _, check := range a.EffectiveReadiness(routes) {
		if service, ok := services[check.Service].(map[string]any); ok {
			if scale, exists := service["scale"].(float64); exists && scale <= 0 {
				return fmt.Errorf("HTTP readiness service %s has no replicas", check.Service)
			}
			if deploy, ok := service["deploy"].(map[string]any); ok {
				if replicas, exists := deploy["replicas"].(float64); exists && replicas <= 0 {
					return fmt.Errorf("HTTP readiness service %s has no replicas", check.Service)
				}
			}
		}
		if _, ok := services[check.Service]; !ok {
			return fmt.Errorf("HTTP readiness references missing or disabled service %s", check.Service)
		}
	}
	return nil
}
