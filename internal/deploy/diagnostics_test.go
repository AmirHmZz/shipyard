package deploy

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"shipyard/internal/model"
)

type authExecutor struct {
	commands         []string
	config           []byte
	cancel           context.CancelFunc
	cleanupCancelled bool
}

func (n *authExecutor) Close() error { return nil }

func (n *authExecutor) Run(ctx context.Context, cmd string, input io.Reader, out io.Writer) error {
	return n.RunSeparated(ctx, cmd, input, out, io.Discard)
}
func (n *authExecutor) RunSeparated(ctx context.Context, cmd string, input io.Reader, _, _ io.Writer) error {
	n.commands = append(n.commands, cmd)
	if strings.Contains(cmd, "auth/config.json") && input != nil {
		n.config, _ = io.ReadAll(input)
	}
	if strings.Contains(cmd, "'buildx'") {
		if n.cancel != nil {
			n.cancel()
			return ctx.Err()
		}
		return errors.New("build failed")
	}
	if strings.Contains(cmd, "'rm'") && ctx.Err() != nil {
		n.cleanupCancelled = true
	}
	return nil
}

func TestBuildCancellationStillCleansCredentialAndSecretFiles(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	node := &authExecutor{cancel: cancel}
	r := model.Release{Directory: "/release", App: model.App{Engine: "dockerfile", Context: ".", File: "Dockerfile"}, BuildSecrets: map[string]string{"TOKEN": "private-build-token"}}
	engine := Engine{Remote: node, Log: io.Discard, Guard: func(ctx context.Context) error { return ctx.Err() }}
	if err := engine.Build(ctx, &r, map[string]model.RegistryCredential{"ghcr.io": {Username: "user", Password: "private-registry-token"}}); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	commands := strings.Join(node.commands, "\n")
	if node.cleanupCancelled || !strings.Contains(commands, "'rm' '-f' '/release/auth/config.json'") || !strings.Contains(commands, "'rm' '-f' '/release/secret-TOKEN'") {
		t.Fatal("cancellation prevented credential cleanup")
	}
}

func TestBuildIsolatedRegistryAuthAndCleanup(t *testing.T) {
	for _, credentials := range []map[string]model.RegistryCredential{nil, {"docker.io": {Username: "docker-user", Password: "docker-token"}, "ghcr.io": {Username: "github-user", Password: "github-token"}}} {
		node := &authExecutor{}
		r := model.Release{Directory: "/release", App: model.App{Engine: "dockerfile", Context: ".", File: "Dockerfile"}}
		engine := Engine{Remote: node, Log: io.Discard}
		if err := engine.Build(context.Background(), &r, credentials); err == nil {
			t.Fatal("expected fixture build failure")
		}
		var config struct {
			Auths map[string]struct{ Auth string } `json:"auths"`
		}
		if err := json.Unmarshal(node.config, &config); err != nil || len(config.Auths) != len(credentials) {
			t.Fatal(string(node.config), err)
		}
		if len(credentials) > 0 && (config.Auths["https://index.docker.io/v1/"].Auth == "" || config.Auths["ghcr.io"].Auth == "") {
			t.Fatal("missing auth keys")
		}
		commands := strings.Join(node.commands, "\n")
		if strings.Contains(commands, "docker-token") || !strings.Contains(commands, "'chmod' '700'") || !strings.Contains(commands, "'rm' '-f' '/release/auth/config.json'") {
			t.Fatal("credential isolation or cleanup failed")
		}
	}
}

type diagnosticExecutor struct {
	raw      string
	mu       sync.Mutex
	followed []string
}

func (n *diagnosticExecutor) Close() error { return nil }

func (n *diagnosticExecutor) Run(ctx context.Context, cmd string, in io.Reader, out io.Writer) error {
	return n.RunSeparated(ctx, cmd, in, out, io.Discard)
}
func (n *diagnosticExecutor) RunSeparated(ctx context.Context, cmd string, _ io.Reader, out, _ io.Writer) error {
	if strings.Contains(cmd, "'inspect'") {
		_, err := io.WriteString(out, n.raw)
		return err
	}
	if strings.Contains(cmd, "'logs'") {
		if strings.Contains(cmd, "'--follow'") {
			n.mu.Lock()
			n.followed = append(n.followed, cmd)
			n.mu.Unlock()
		}
		_, err := io.WriteString(out, "2026-10-21T00:00:00.000000001Z Configuration error: invalid config\n")
		if strings.Contains(cmd, "'--follow'") {
			<-ctx.Done()
			return ctx.Err()
		}
		return err
	}
	_, err := io.WriteString(out, "container\n")
	return err
}

func TestStartupLogsAndDiagnosticsAreReleaseScoped(t *testing.T) {
	node := &diagnosticExecutor{raw: `[{"Id":"current-one","RestartCount":8,"Config":{"Labels":{"shipyard.app":"app","shipyard.release":"release","com.docker.compose.service":"clickhouse","com.docker.compose.container-number":"1"}},"State":{"Status":"restarting","ExitCode":78,"OOMKilled":true,"Health":{"Status":"unhealthy","Log":[{"ExitCode":1,"Output":"health check failed"}]}}},{"Id":"previous","Config":{"Labels":{"shipyard.app":"app","shipyard.release":"old","com.docker.compose.service":"old"}}}]`}
	var output bytes.Buffer
	// The deployment writer serializes concurrent producers in production.
	writer := &testLockedWriter{writer: &output}
	engine := Engine{Remote: node, Log: writer}
	r := model.Release{ID: "release", AppID: "app", App: model.App{Engine: "compose"}}
	stop := engine.FollowStartup(context.Background(), r)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		node.mu.Lock()
		count := len(node.followed)
		node.mu.Unlock()
		if count > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	stop()
	stop()
	engine.Diagnostics(context.Background(), r)
	for _, want := range []string{"[clickhouse/1 current-one]", "Configuration error", "state=restarting exit=78 restarts=8 OOM=true", "health check failed"} {
		if !strings.Contains(output.String(), want) {
			t.Fatalf("missing %q: %s", want, output.String())
		}
	}
	node.mu.Lock()
	defer node.mu.Unlock()
	if len(node.followed) != 1 || strings.Contains(node.followed[0], "previous") || strings.Contains(output.String(), "[old/") {
		t.Fatal("wrong release logs collected")
	}
}

type testLockedWriter struct {
	mu     sync.Mutex
	writer io.Writer
}

func (w *testLockedWriter) Write(b []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.writer.Write(b)
}

func TestStartupLogBudgetAndOversizedLines(t *testing.T) {
	var output bytes.Buffer
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w := &startupWriter{budget: &startupBudget{remaining: 100, output: &output}, cancel: cancel}
	_, _ = w.Write([]byte(strings.Repeat("a", 200) + "\n"))
	if ctx.Err() == nil || !strings.Contains(output.String(), "limit reached") {
		t.Fatal("output was not bounded")
	}
}
