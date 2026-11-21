package control

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"shipyard/internal/model"
	"shipyard/internal/remote"
)

type runtimeLogsExecutor struct {
	remote.Executor
	output string
}

func (e runtimeLogsExecutor) Run(ctx context.Context, _ string, _ io.Reader, output io.Writer) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	_, err := io.WriteString(output, e.output)
	return err
}

func TestMCPRuntimeLogsBoundedCapture(t *testing.T) {
	const stamp = "2026-01-01T00:00:00.000000001Z "
	release := model.Release{Containers: []string{"web"}, Env: map[string]string{"SECRET": "secret-value\nsecond-line"}}
	node := runtimeLogsExecutor{output: "runtime diagnostic\n" + stamp + "secret-value and second-line\n" +
		stamp + strings.Repeat("x", RuntimeLogByteLimit)}
	result, err := captureRuntimeLogs(t.Context(), node, release, "web", 100)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Truncated || len(result.Entries) != 1 || result.Entries[0].Message != "[REDACTED] and [REDACTED]" {
		t.Fatalf("unexpected runtime log capture: %+v", result)
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := captureRuntimeLogs(ctx, node, release, "web", 100); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected cancellation, got %v", err)
	}
}
