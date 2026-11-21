package control

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"shipyard/internal/providers"
	"shipyard/internal/testproxy"
	"strings"
	"testing"
	"time"

	"shipyard/internal/model"
)

func TestDNSProviderUsesIndependentProxySelection(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	spec, requests := testproxy.Start(t)
	connection := resource(t, c, "proxy", "", "", spec, nil)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"result":[]}`))
	}))
	defer server.Close()
	for _, selected := range []string{connection.ID, ""} {
		p, err := c.DNSConnection(ctx, model.DNS{Provider: "cloudflare", ProxyID: selected}, "token")
		if err != nil {
			t.Fatal(err)
		}
		client := p.(*providers.DNSClient)
		client.Base = server.URL
		if _, err = p.Zones(ctx); err != nil {
			t.Fatal(err)
		}
	}
	if requests.Load() != 1 {
		t.Fatal("DNS direct/proxy selections were mixed", requests.Load())
	}
}

func TestMonitoringCountersResetAndApplicationAggregation(t *testing.T) {
	at := time.Now()
	before := counterSnapshot{At: at, Boot: "one", Total: 100, Used: 50, Network: map[string]ioCounter{"eth0": {100, 200}}}
	current := counterSnapshot{At: at.Add(30 * time.Second), Boot: "one", Total: 200, Used: 75, Network: map[string]ioCounter{"eth0": {400, 800}}}
	m := Metric{Network: []IORate{}, Devices: []IORate{}}
	applyHostRates(&m, current, before)
	if m.CPU != 25 || !m.CPUValid || len(m.Network) != 1 || *m.Network[0].Read != 10 {
		t.Fatal(m)
	}
	current.Boot = "two"
	m = Metric{}
	applyHostRates(&m, current, before)
	if m.CPUValid || m.Network[0].Read != nil {
		t.Fatal("reboot produced a rate", m)
	}
	if rate(1, 100, 30) != nil || rate(200, 100, 100) != nil {
		t.Fatal("counter resets or gaps produced rates")
	}
	server := Metric{Online: true, Valid: true, MemoryTotalBytes: 1000, Containers: []ContainerMetric{{ID: strings.Repeat("a", 64), CPU: 150, MemoryBytes: 200}, {ID: strings.Repeat("b", 64), CPU: 50, MemoryBytes: 100}, {ID: strings.Repeat("c", 64), CPU: 99, MemoryBytes: 900}}}
	app := aggregateApplication(server, []string{strings.Repeat("a", 64), strings.Repeat("b", 64)}, "app", "running")
	if app.CPU != 200 || app.MemoryBytes != 300 || app.Memory != 30 || len(app.Containers) != 2 {
		t.Fatal(app)
	}
	job := aggregateApplication(Metric{Online: true, Valid: true, Containers: []ContainerMetric{{ID: strings.Repeat("d", 64), Name: "sy-job-owned", CPU: 25}}}, []string{"sy-job-owned"}, "job", "running")
	if len(job.Containers) != 1 || job.CPU != 25 {
		t.Fatal("named Job attempt metrics were lost", job)
	}
	stopped := aggregateApplication(server, nil, "app", "stopped")
	if stopped.Online || stopped.Status != "stopped" {
		t.Fatal(stopped)
	}
}

func TestHostSampleSeparatesDiskAndCPUValidity(t *testing.T) {
	at := time.Now()
	_, previous := readHostCounters("BOOT same\nCPU 2200000000 5000000000\n", at)
	m, current := readHostCounters("BOOT same\nCPU 2200000025 5000000100\nMEM 100 200\n", at.Add(time.Second))
	applyHostRates(&m, current, previous)
	if !m.CPUValid || m.CPU != 25 || !m.Valid || m.diskKnown() {
		t.Fatalf("unexpected sample validity: %+v", m)
	}
	m, current = readHostCounters("BOOT same\nCPU 2.2e+09 5000000100\nDISK 0%\n", at.Add(time.Second))
	applyHostRates(&m, current, previous)
	if m.CPUValid || !m.diskKnown() || m.Disk != 0 {
		t.Fatalf("invalid CPU and valid zero disk were not distinguished: %+v", m)
	}
}

func TestHostMetricScriptMeasuresDockerDataRoot(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("host collector reads Linux /proc")
	}
	fakes := t.TempDir()
	for name, script := range map[string]string{
		"docker": "#!/bin/sh\nprintf '%s\\n' '/custom docker root'\n",
		"df":     "#!/bin/sh\n[ \"$1\" = -P ] && [ \"$2\" = \"$EXPECTED_ROOT\" ] || exit 1\nprintf 'Filesystem Blocks Used Available Capacity Mounted\\n/dev/test 100 42 58 42%% /mount\\n'\n",
	} {
		if err := os.WriteFile(filepath.Join(fakes, name), []byte(script), 0700); err != nil {
			t.Fatal(err)
		}
	}
	for _, test := range []struct {
		root, expected string
	}{{"", "/custom docker root"}, {"/host/docker-root", "/host/docker-root"}} {
		command := exec.Command("sh", "-c", hostMetricScript, "metrics", test.root)
		command.Env = append(os.Environ(), "PATH="+fakes+":"+os.Getenv("PATH"), "EXPECTED_ROOT="+test.expected)
		output, err := command.Output()
		if err != nil {
			t.Fatal(err)
		}
		point, _ := readHostCounters(string(output), time.Now())
		if !point.diskKnown() || point.Disk != 42 {
			t.Fatalf("disk collected from the wrong root %q: %+v", test.expected, point)
		}
	}
}
func TestMonitoringPoliciesIncidentsAndSelectedDestinations(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	_, _ = c.Store.Pool.Exec(ctx, "UPDATE settings SET value='false' WHERE key='maintenance'")
	host := resource(t, c, "server", "", "", model.Server{}, nil)
	selected := resource(t, c, "webhook", "", "", model.Webhook{URL: "https://one.invalid"}, nil)
	_ = resource(t, c, "webhook", "", "", model.Webhook{URL: "https://two.invalid"}, nil)
	defaults, err := c.MonitoringDefaults(ctx)
	if err != nil {
		t.Fatal(err)
	}
	p := defaults.Server
	p.SustainedSeconds = 30
	p.Destinations = []string{selected.ID}
	if err = c.SetMonitoringPolicy(ctx, host, MonitoringPolicyState{Mode: "override", Policy: p}); err != nil {
		t.Fatal(err)
	}
	at := time.Now().UTC()
	m := Metric{ResourceID: host.ID, CPU: 99, Online: true, Valid: true, CPUValid: true, At: at, Containers: []ContainerMetric{}}
	for _, offset := range []time.Duration{0, 30 * time.Second, 60 * time.Second} {
		m.At = at.Add(offset)
		if err = c.evaluateMonitoring(ctx, host, m); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err = c.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE kind='notify'").Scan(&count); err != nil || count != 1 {
		t.Fatal(count, err)
	}
	missing := m
	missing.At = at.Add(75 * time.Second)
	missing.Valid = false
	missing.Status = "degraded"
	if err = c.evaluateMonitoring(ctx, host, missing); err != nil {
		t.Fatal(err)
	}
	if err = c.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE kind='notify'").Scan(&count); err != nil || count != 1 {
		t.Fatal("missing data falsely recovered resource alert", count, err)
	}
	missing.Valid = true
	missing.CPUValid = false
	missing.CPU = 0
	if err = c.evaluateMonitoring(ctx, host, missing); err != nil {
		t.Fatal(err)
	}
	if err = c.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE kind='notify'").Scan(&count); err != nil || count != 1 {
		t.Fatal("missing CPU baseline falsely recovered resource alert", count, err)
	}
	m.CPU = 1
	m.At = at.Add(90 * time.Second)
	if err = c.evaluateMonitoring(ctx, host, m); err != nil {
		t.Fatal(err)
	}
	if err = c.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE kind='notify'").Scan(&count); err != nil || count != 2 {
		t.Fatal(count, err)
	}
	if err = c.Store.DeleteIntegration(ctx, selected.ID); err == nil {
		t.Fatal("referenced destination deleted")
	}
	if err = c.SetMonitoringPolicy(ctx, host, MonitoringPolicyState{Mode: "disabled"}); err != nil {
		t.Fatal(err)
	}
	disabled, err := c.MonitoringPolicy(ctx, host)
	if err != nil || disabled.Mode != "disabled" || len(disabled.Policy.Destinations) != 1 || disabled.Policy.CPU != p.CPU {
		t.Fatal("disabling discarded policy configuration", disabled, err)
	}
	if err = c.SetMonitoringPolicy(ctx, host, MonitoringPolicyState{Mode: "inherit"}); err != nil {
		t.Fatal(err)
	}
	state, err := c.MonitoringPolicy(ctx, host)
	if err != nil || state.Mode != "inherit" {
		t.Fatal(state, err)
	}
}
func TestMonitoringHistoryBucketsAndRangeValidation(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	host := resource(t, c, "server", "", "", model.Server{}, nil)
	for i := 0; i < 3; i++ {
		m := Metric{ResourceID: host.ID, At: time.Now().Add(-time.Duration(i) * time.Minute), Online: true, Valid: true, CPUValid: true, CPU: float64(10 + i), Memory: 20, Disk: 30, Network: []IORate{}, Devices: []IORate{}, Containers: []ContainerMetric{}}
		raw, _ := json.Marshal(m)
		if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO metrics(resource_id,data,created_at) VALUES($1,$2,$3)", host.ID, raw, m.At); err != nil {
			t.Fatal(err)
		}
	}
	for _, value := range []string{"1h", "24h", "7d", "30d"} {
		points, err := c.MetricHistory(ctx, host.ID, value)
		if err != nil || len(points) == 0 {
			t.Fatal(value, points, err)
		}
		if (value == "7d" || value == "30d") && points[0].PeakCPU == nil {
			t.Fatal("peaks missing", points)
		}
	}
	if _, err := c.MetricHistory(ctx, host.ID, "365d"); err == nil {
		t.Fatal("unbounded range accepted")
	}
}

func TestMonitoringHistoryExcludesInvalidMemoryAndDiskSamples(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	host := resource(t, c, "server", "", "", model.Server{}, nil)
	at := time.Now().UTC().Add(-time.Hour).Truncate(5 * time.Minute).Add(time.Minute)
	noDisk := false
	for _, point := range []Metric{
		{Online: true, Valid: true, MemoryBytes: 800, Memory: 80, Disk: 70},
		{Online: true, Valid: true, MemoryBytes: 400, Memory: 40, DiskValid: &noDisk},
		{DiskValid: &noDisk},
	} {
		if _, err := c.Store.Pool.Exec(ctx, "INSERT INTO metrics(resource_id,data,created_at) VALUES($1,$2,$3)", host.ID, metricJSON(point), at); err != nil {
			t.Fatal(err)
		}
	}
	points, err := c.MetricHistory(ctx, host.ID, "7d")
	if err != nil || len(points) != 1 {
		t.Fatalf("expected one bucket: %+v, %v", points, err)
	}
	point := points[0]
	if point.MemoryBytes != 600 || point.Memory != 60 || !point.diskKnown() || point.Disk != 70 {
		t.Fatalf("invalid samples skewed history: %+v", point)
	}
}
