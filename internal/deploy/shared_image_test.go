package deploy

import (
	"context"
	"encoding/json"
	"io"
	"strings"
	"testing"

	"shipyard/internal/model"
)

type sharedImageExecutor struct {
	config   string
	build    map[string]any
	commands []string
}

func (n *sharedImageExecutor) Close() error { return nil }
func (n *sharedImageExecutor) Run(ctx context.Context, command string, input io.Reader, out io.Writer) error {
	return n.RunSeparated(ctx, command, input, out, io.Discard)
}
func (n *sharedImageExecutor) RunSeparated(_ context.Context, command string, input io.Reader, out, _ io.Writer) error {
	n.commands = append(n.commands, command)
	if input != nil && strings.Contains(command, "/build.json") {
		if err := json.NewDecoder(input).Decode(&n.build); err != nil {
			return err
		}
	}
	if strings.Contains(command, "'config'") {
		_, err := io.WriteString(out, n.config)
		return err
	}
	if strings.Contains(command, "'image' 'inspect'") {
		id := "sha256:shared"
		if strings.Contains(command, "redis:7") {
			id = "sha256:redis"
		}
		_, err := io.WriteString(out, id)
		return err
	}
	return nil
}

func TestComposeBuildOnceSharedImage(t *testing.T) {
	for _, external := range []bool{false, true} {
		services := map[string]any{
			"oss": map[string]any{"image": "noname-python-beta:local", "build": map[string]any{"context": "/release/source", "dockerfile": "Dockerfile"}},
		}
		for _, name := range []string{"mds", "ss", "backend"} {
			services[name] = map[string]any{"image": "noname-python-beta:local"}
		}
		if external {
			services["redis"] = map[string]any{"image": "redis:7"}
		}
		raw, _ := json.Marshal(map[string]any{"services": services})
		node := &sharedImageExecutor{config: string(raw)}
		r := model.Release{ID: "release", AppID: "app", Directory: "/release", App: model.App{Source: "git", Engine: "compose", ComposeMode: "inline", Context: "."}}
		engine := Engine{Remote: node, Log: io.Discard}
		if err := engine.Build(context.Background(), &r, nil); err != nil {
			t.Fatal(err)
		}
		built := 0
		for name, raw := range node.build["services"].(map[string]any) {
			service := raw.(map[string]any)
			if _, ok := service["build"]; ok {
				built++
			}
			if name != "redis" && service["image"] != "shipyard/app-oss:release" {
				t.Fatalf("%s does not use the shared release image: %v", name, service)
			}
		}
		if built != 1 {
			t.Fatalf("expected one build, got %d", built)
		}
		pulls := 0
		for _, command := range node.commands {
			if strings.Contains(command, "'pull' '--ignore-buildable'") {
				pulls++
				if !external || !strings.HasSuffix(command, "'redis'") {
					t.Fatalf("unexpected pull: %s", command)
				}
			}
		}
		if external && pulls != 1 {
			t.Fatal("independent image was not pulled")
		}
		var frozen map[string]any
		if err := json.Unmarshal([]byte(r.Compose), &frozen); err != nil {
			t.Fatal(err)
		}
		for _, name := range []string{"oss", "mds", "ss", "backend"} {
			service := frozen["services"].(map[string]any)[name].(map[string]any)
			if r.Images[name] != "sha256:shared" || service["image"] != "sha256:shared" || service["pull_policy"] != "never" || service["build"] != nil {
				t.Fatalf("shared image not pinned for %s: %v", name, service)
			}
		}
	}
}

func TestSharedImageRequiresUnambiguousBuilder(t *testing.T) {
	services := map[string]any{
		"one":      map[string]any{"image": "shared:local", "build": map[string]any{"context": "."}},
		"two":      map[string]any{"image": "shared:local", "build": map[string]any{"context": "."}},
		"consumer": map[string]any{"image": "shared:local"},
	}
	if _, err := prepareComposeImages(model.Release{}, services); err == nil || !strings.Contains(err.Error(), "multiple build services") {
		t.Fatalf("ambiguous shared image accepted: %v", err)
	}
}

func TestDisabledBuilderDoesNotSupplySharedImage(t *testing.T) {
	// Disabled profile services have already been removed before image resolution.
	services := map[string]any{"consumer": map[string]any{"image": "shared:local"}}
	pull, err := prepareComposeImages(model.Release{}, services)
	if err != nil || len(pull) != 1 || pull[0] != "consumer" || services["consumer"].(map[string]any)["image"] != "shared:local" {
		t.Fatalf("image without an enabled builder should be pulled: %v, %v", pull, err)
	}
}
