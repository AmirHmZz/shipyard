package deploy

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"shipyard/internal/model"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestPrivateHTTPReadinessUsesEveryReplicaWithoutProxyTargets(t *testing.T) {
	r := model.Release{App: model.App{ReadinessChecks: []model.HTTPReadinessCheck{{Service: "private", Port: 8080, Path: "/ready"}}}, Networks: []model.NetworkEndpoint{{Service: "private", Replica: 1, DockerName: "managed", Ingress: true, IPv4: "172.20.0.2"}, {Service: "private", Replica: 2, DockerName: "managed", Ingress: true, IPv4: "172.20.0.3"}}}
	var containers []container
	if err := json.Unmarshal([]byte(`[{"Id":"one","Config":{"Labels":{"com.docker.compose.service":"private","com.docker.compose.container-number":"1"}},"NetworkSettings":{"Networks":{"managed":{"IPAddress":"172.20.0.2"}}}},{"Id":"two","Config":{"Labels":{"com.docker.compose.service":"private","com.docker.compose.container-number":"2"}},"NetworkSettings":{"Networks":{"managed":{"IPAddress":"172.20.0.3"}}}}]`), &containers); err != nil {
		t.Fatal(err)
	}
	probes, err := httpReadinessProbes(r, containers)
	if err != nil || len(probes) != 2 || probes[1].Address != "172.20.0.3" || len(r.Targets) != 0 {
		t.Fatal(probes, err)
	}
	r.Networks[0].IPv4 = "172.20.0.9"
	if _, err = httpReadinessProbes(r, containers); err == nil {
		t.Fatal("replaced endpoint accepted")
	}
	if _, err = httpReadinessProbes(r, nil); err == nil {
		t.Fatal("missing replicas accepted")
	}
}

type readinessExecutor struct{ state string }

type discoveryExecutor struct{ readinessExecutor }

func (n discoveryExecutor) RunSeparated(_ context.Context, command string, _ io.Reader, output, _ io.Writer) error {
	if strings.Contains(command, "'inspect'") {
		_, err := io.WriteString(output, `[
{"Id":"restarting","Config":{"Labels":{"com.docker.compose.service":"bridge","com.docker.compose.container-number":"1"}},"State":{"Status":"restarting"},"NetworkSettings":{"Networks":{"managed":{"IPAddress":"172.20.0.2"}}}},
{"Id":"healthy","Config":{"Labels":{"com.docker.compose.service":"docs","com.docker.compose.container-number":"1"}},"State":{"Status":"running"},"NetworkSettings":{"Networks":{"managed":{"IPAddress":"172.20.0.3"}}}}
]`)
		return err
	}
	_, err := io.WriteString(output, "restarting\nhealthy\n")
	return err
}

func TestDiscoverRunningKeepsOnlyVerifiedSiblingTargets(t *testing.T) {
	engine := Engine{Remote: discoveryExecutor{}}
	release := model.Release{
		Routes: []model.Resource{
			{Data: json.RawMessage(`{"service":"bridge","targetPort":8080}`)},
			{Data: json.RawMessage(`{"service":"docs","targetPort":8000}`)},
		},
		Networks: []model.NetworkEndpoint{
			{Service: "bridge", Replica: 1, DockerName: "managed", Ingress: true, IPv4: "172.20.0.2"},
			{Service: "docs", Replica: 1, DockerName: "managed", Ingress: true, IPv4: "172.20.0.3"},
		},
	}
	err := engine.DiscoverRunning(context.Background(), &release)
	if err == nil || len(release.Containers) != 2 || len(release.Targets) != 1 || release.Targets[0].Service != "docs" || release.Targets[0].Port != 8000 {
		t.Fatal(release.Containers, release.Targets, err)
	}
	if err := engine.Discover(context.Background(), &release); err != nil || len(release.Targets) != 2 {
		t.Fatal("deployment discovery changed", release.Targets, err)
	}
}

func (n readinessExecutor) Close() error { return nil }
func (n readinessExecutor) Run(ctx context.Context, command string, input io.Reader, output io.Writer) error {
	return n.RunSeparated(ctx, command, input, output, io.Discard)
}
func (n readinessExecutor) RunSeparated(_ context.Context, command string, _ io.Reader, output, _ io.Writer) error {
	if strings.Contains(command, "'inspect'") {
		_, err := io.WriteString(output, `[{"Id":"1234567890123456","Config":{"Labels":{"com.docker.compose.service":"private","com.docker.compose.container-number":"1"}},"State":{"Status":"`+n.state+`","ExitCode":0},"NetworkSettings":{"Networks":{"managed":{"IPAddress":"172.20.0.2"}}}}]`)
		return err
	}
	_, err := io.WriteString(output, "1234567890123456\n")
	return err
}
func TestHTTPReadinessFailuresAndSuccessfulOneShotDoNotPass(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { requests.Add(1); w.WriteHeader(503) }))
	defer server.Close()
	r := model.Release{App: model.App{Engine: "compose", ReadinessChecks: []model.HTTPReadinessCheck{{Service: "private", Port: 8080, Path: "/ready"}}}, Networks: []model.NetworkEndpoint{{Service: "private", Replica: 1, DockerName: "managed", Ingress: true, IPv4: "172.20.0.2"}}}
	for _, state := range []string{"running", "exited"} {
		t.Run(state, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
			defer cancel()
			engine := Engine{Remote: readinessExecutor{state: state}, Dial: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, "tcp", strings.TrimPrefix(server.URL, "http://"))
			}}
			if err := engine.Healthy(ctx, r); err == nil {
				t.Fatal("failed HTTP/one-shot readiness passed")
			}
		})
	}
	if requests.Load() == 0 {
		t.Fatal("private HTTP probe was not sent")
	}
}
