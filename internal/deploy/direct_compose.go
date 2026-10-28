package deploy

import (
	"archive/tar"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"shipyard/internal/model"
)

func (e *Engine) TransferCompose(ctx context.Context, r *model.Release, source string) error {
	if err := model.ValidateComposeSource(source); err != nil {
		return err
	}
	r.App.Engine = "compose"
	r.App.Context = "."
	r.App.File = "compose.yaml"
	sum := sha256.Sum256([]byte(source))
	r.Commit = fmt.Sprintf("compose:%x", sum[:6])
	return e.Transfer(ctx, *r, func(w io.Writer) error {
		archive := tar.NewWriter(w)
		if err := archive.WriteHeader(&tar.Header{Name: "compose.yaml", Mode: 0600, Size: int64(len(source))}); err != nil {
			return err
		}
		if _, err := io.WriteString(archive, source); err != nil {
			return err
		}
		return archive.Close()
	})
}

// The managed document lives outside the checkout; repository files are never overwritten.
func (e *Engine) WriteInlineCompose(ctx context.Context, r model.Release, source string) error {
	if err := r.App.ValidateCompose(source); err != nil {
		return err
	}
	return Write(ctx, e.Remote, r.Directory+"/inline-compose.yaml", []byte(source))
}

func buildPathToCheck(r model.Release, base string) string {
	if r.App.Source != "compose" && r.App.InlineCompose() {
		return base + "/" + r.App.Context
	}
	return base + "/" + r.App.File
}

// Render all declared services, including inactive profiles, before any image build.
func (e *Engine) RenderCompose(ctx context.Context, r model.Release, contextDir, file string) (map[string]any, error) {
	args := []string{"env", "DOCKER_CONFIG=" + r.Directory + "/auth", "docker", "compose", "--ansi", "never", "--progress", "plain", "-p", Project(r), "--project-directory", contextDir, "--env-file", r.Directory + "/build.env", "-f", file}
	args = append(args, "--profile", "*", "config", "--format", "json")
	raw, err := Output(ctx, e.Remote, args...)
	if err != nil {
		return nil, fmt.Errorf("render Compose configuration: %w", err)
	}
	var cfg map[string]any
	if err = json.Unmarshal([]byte(raw), &cfg); err != nil {
		return nil, fmt.Errorf("decode Compose configuration (%d bytes): %w", len(raw), err)
	}
	services, ok := cfg["services"].(map[string]any)
	if !ok || len(services) == 0 {
		return nil, errors.New("Compose must contain at least one service")
	}
	return cfg, nil
}
