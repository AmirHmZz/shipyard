package contract_test

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"shipyard/internal/buildinfo"
	"shipyard/internal/control"
	"shipyard/internal/model"
	"shipyard/internal/platformupdate"
	"shipyard/internal/testcontract"
)

type fixture struct {
	Name   string `json:"name"`
	Schema string `json:"schema"`
	Body   any    `json:"body"`
}

func TestNetworkingRequestContractRejectsResponseFields(t *testing.T) {
	schema := testcontract.Document(t).Components.Schemas["NetworkingInput"].Value
	valid := map[string]any{"version": float64(1), "services": map[string]any{}}
	if err := schema.VisitJSON(valid); err != nil {
		t.Fatal(err)
	}
	for _, value := range []any{map[string]any{"version": float64(1)}, map[string]any{"version": float64(1), "services": nil}} {
		if err := schema.VisitJSON(value); err != nil {
			t.Fatal("nil service overrides rejected", err)
		}
	}
	for _, field := range []string{"applied", "endpoints", "pending", "unknown"} {
		invalid := map[string]any{"version": float64(1), "services": map[string]any{}, field: true}
		if schema.VisitJSON(invalid) == nil {
			t.Fatalf("request schema accepts read-only/unknown field %s", field)
		}
	}
}

func TestFixedRequestContractsRejectUnknownFields(t *testing.T) {
	doc := testcontract.Document(t)
	for name, body := range map[string]any{
		"DNSRecordInput":   model.DNSRecord{Type: "A", Name: "app.example.com", Content: "192.0.2.1", Data: json.RawMessage(`{"providerSpecific":true}`)},
		"AlertPolicyInput": control.AlertPolicy{CPU: 90, Memory: 90, Disk: 90, SustainedSeconds: 300, OfflineSeconds: 60},
	} {
		raw, _ := json.Marshal(body)
		var value map[string]any
		if err := json.Unmarshal(raw, &value); err != nil {
			t.Fatal(err)
		}
		schema := doc.Components.Schemas[name].Value
		if err := schema.VisitJSON(value); err != nil {
			t.Fatal(name, err)
		}
		value["unknown"] = true
		if schema.VisitJSON(value) == nil {
			t.Fatal(name, "accepts an unknown field")
		}
	}
}

func TestContractFixtures(t *testing.T) {
	now := time.Date(2026, 10, 22, 0, 0, 0, 0, time.UTC)
	ready := control.DomainState{RouteID: "route-1", Domain: "app.example.com", DNS: "ready", Propagation: "ready", Certificate: "ready", Routing: "ready", ExpiresAt: &now}
	// Decode only the private owned-record collection; serialization still uses the Go DTO.
	if err := json.Unmarshal([]byte(`{"records":[{"id":"record-1","type":"A","name":"app.example.com","content":"192.0.2.1","owned":true}]}`), &ready); err != nil {
		t.Fatal(err)
	}
	pending := ready
	pending.DNS, pending.Propagation, pending.Certificate, pending.Routing, pending.ExpiresAt = "pending", "pending", "pending", "pending", nil
	conflict := pending
	conflict.DNS, conflict.Error = "conflict", "DNS record conflict"
	failed := pending
	failed.Error = "server not found"
	failed.Sync = &control.DomainSync{ID: "job-1", State: "failed", Attempts: 6, Error: failed.Error}
	fixtures := []fixture{
		{"legacy-application-policy", "ApplicationChecks", model.App{}},
		{"container-application-policy", "ApplicationChecks", model.App{ReadinessMode: "container", HealthTimeout: 300, ReadinessChecks: []model.HTTPReadinessCheck{{Service: "worker", Port: 8080, Path: "/ready"}}}},
		{"route-ready", "DomainState", ready}, {"route-pending", "DomainState", pending}, {"route-conflict", "DomainState", conflict}, {"route-sync-failed", "DomainState", failed},
		{"networking-before-deploy", "ApplicationNetworking", map[string]any{"version": 1, "services": map[string]model.ServiceNetworking{}, "applied": map[string]model.ServiceNetworking{}, "endpoints": []model.NetworkEndpoint(nil), "pending": false}},
		{"networking-docker-assigned", "ApplicationNetworking", map[string]any{"version": 1, "services": map[string]model.ServiceNetworking{"app": {}}, "applied": map[string]model.ServiceNetworking{}, "endpoints": []model.NetworkEndpoint{{Service: "app", Replica: 1, NetworkID: "network-1", DockerName: "bridge", Ingress: false}}, "pending": true}},
		{"runtime-private", "ApplicationRuntime", map[string]any{"status": "running", "containers": []string{"app"}, "targets": []model.Target(nil), "containerDetails": []control.ContainerDetail{{ID: "app", Service: "web", Replica: 1, Name: "stack-web-1"}}}},
		{"docker-network-empty", "DockerNetwork", control.DockerNetwork{ID: "network-1", Name: "bridge", Driver: "bridge"}},
		{"updates-unavailable", "SystemUpdates", platformupdate.Status{Reason: "System updates require the release installer"}},
		{"network-deletion", "DeletionResult", map[string]bool{"ok": true}},
		{"asynchronous-deletion", "DeletionResult", map[string]any{"ok": true, "jobId": "cleanup-job"}},
		{"published-ports-empty", "PublishedPorts", map[string]any{"version": 1, "services": map[string][]model.PublishedPort(nil)}},
		{"build-release", "BuildInfo", buildinfo.Info{Version: "9.8.7", Commit: "contract", BuiltAt: "test", Architecture: "amd64", UpdaterProtocol: 1}},
		{"build-dev", "BuildInfo", buildinfo.Info{Version: "dev", Commit: "unknown", BuiltAt: "unknown", Architecture: "amd64", UpdaterProtocol: 1}},
		{"metric-empty", "Metric", control.Metric{ResourceID: "server", At: now, Containers: []control.ContainerMetric{}, Network: []control.IORate{}, Devices: []control.IORate{}}},
		{"monitoring-policy", "MonitoringPolicy", control.MonitoringPolicy{Enabled: true, CPU: 90, Memory: 90, Disk: 90, SustainedSeconds: 300, OfflineSeconds: 60, Destinations: []string{}}},
		{"http-error", "Error", map[string]string{"error": "DNS provider unavailable"}},
	}
	doc := testcontract.Document(t)
	for _, f := range fixtures {
		raw, err := json.Marshal(f.Body)
		if err != nil {
			t.Fatal(err)
		}
		var value any
		if err = json.Unmarshal(raw, &value); err != nil {
			t.Fatal(err)
		}
		if err = doc.Components.Schemas[f.Schema].Value.VisitJSON(value); err != nil {
			t.Fatalf("%s: %v", f.Name, err)
		}
	}
	raw, err := json.MarshalIndent(fixtures, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	raw = append(raw, '\n')
	path := filepath.Join("testdata", "contracts.json")
	if os.Getenv("UPDATE_API_FIXTURES") == "1" {
		if err = os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(path, raw, 0644); err != nil {
			t.Fatal(err)
		}
	}
	expected, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(raw, expected) {
		t.Fatal("Go API fixtures changed; regenerate with UPDATE_API_FIXTURES=1 go test ./api -run TestContractFixtures, review, and run frontend fixture tests")
	}
}
