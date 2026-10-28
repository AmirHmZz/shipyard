package deploy

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"shipyard/internal/model"
)

type inlineComposeExecutor struct {
	commands []string
	files    map[string]string
}

func (n *inlineComposeExecutor) Close() error { return nil }
func (n *inlineComposeExecutor) Run(ctx context.Context, command string, input io.Reader, out io.Writer) error {
	return n.RunSeparated(ctx, command, input, out, io.Discard)
}
func (n *inlineComposeExecutor) RunSeparated(_ context.Context, command string, input io.Reader, out, _ io.Writer) error {
	n.commands = append(n.commands, command)
	if input != nil {
		value, _ := io.ReadAll(input)
		n.files[command] = string(value)
	}
	if strings.Contains(command, "'config'") {
		_, _ = io.WriteString(out, `{"services":{"web":{"build":{"context":"/release/source/subdir","dockerfile":"Dockerfile"}},"optional":{"image":"busybox","profiles":["disabled"]}}}`)
	}
	return nil
}

func TestGitInlineComposeRendersBeforeBuildingWithoutOverwritingCheckout(t *testing.T) {
	node := &inlineComposeExecutor{files: map[string]string{}}
	seen := false
	engine := Engine{Remote: node, Log: io.Discard, RenderedConfig: func(_ context.Context, _ *model.Release, cfg map[string]any) error {
		seen = true
		services := cfg["services"].(map[string]any)
		if _, ok := services["optional"]; !ok {
			t.Fatal("inactive profile omitted before cleanup")
		}
		return errors.New("cleanup failed")
	}}
	r := model.Release{Directory: "/release", App: model.App{Source: "git", ComposeMode: "inline", Engine: "compose", Context: "subdir", File: "compose.yaml"}}
	source := "services:\n  web:\n    build: .\n"
	if err := engine.WriteInlineCompose(context.Background(), r, source); err != nil {
		t.Fatal(err)
	}
	err := engine.Build(context.Background(), &r, nil)
	if err == nil || err.Error() != "cleanup failed" || !seen {
		t.Fatal(err, seen)
	}
	for _, cmd := range node.commands {
		if strings.Contains(cmd, "'build'") || strings.Contains(cmd, "'pull'") {
			t.Fatal("images mutated before cleanup", cmd)
		}
		if strings.Contains(cmd, "'config'") && (!strings.Contains(cmd, "'/release/inline-compose.yaml'") || !strings.Contains(cmd, "'/release/source/subdir'") || !strings.Contains(cmd, "'--profile' '*'")) {
			t.Fatal("incorrect render paths/profiles", cmd)
		}
	}
	for command, value := range node.files {
		if value == source && strings.Contains(command, "/source/") {
			t.Fatal("overwrote checked-out files", command)
		}
	}
}
