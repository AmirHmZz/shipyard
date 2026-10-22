package deploy

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"shipyard/internal/model"
	"shipyard/internal/remote"
)

// A minimal private registry is served over an SSH reverse listener on the
// disposable Engine's loopback. No published registry, token or image is used.
func TestLinuxAutomaticRegistryAuthForComposeAndDockerfile(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" || os.Getenv("SHIPYARD_FIXTURE_HOST") == "" {
		t.Skip("requires isolated SSH/Docker fixture")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	key, err := os.ReadFile(os.Getenv("SHIPYARD_FIXTURE_PRIVATE_KEY_FILE"))
	if err != nil {
		t.Fatal(err)
	}
	host := os.Getenv("SHIPYARD_FIXTURE_HOST")
	fingerprint, err := remote.Fingerprint(ctx, host, 2222)
	if err != nil {
		t.Fatal(err)
	}
	node, err := remote.Dial(ctx, model.Server{Host: host, Port: 2222, User: "root", Fingerprint: fingerprint}, string(key), "")
	if err != nil {
		t.Fatal(err)
	}
	defer node.Close()
	listener, err := node.SSH.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	registry := listener.Addr().String()
	config := []byte(`{"architecture":"amd64","os":"linux","config":{"Labels":{"fixture":"registry-auth"}},"rootfs":{"type":"layers","diff_ids":[]},"history":[]}`)
	digest := func(data []byte) string { sum := sha256.Sum256(data); return "sha256:" + hex.EncodeToString(sum[:]) }
	manifest, _ := json.Marshal(map[string]any{"schemaVersion": 2, "mediaType": "application/vnd.docker.distribution.manifest.v2+json", "config": map[string]any{"mediaType": "application/vnd.docker.container.image.v1+json", "size": len(config), "digest": digest(config)}, "layers": []any{}})
	var authenticated atomic.Int32
	server := &http.Server{ReadHeaderTimeout: 5 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Docker-Distribution-API-Version", "registry/2.0")
		username, password, ok := r.BasicAuth()
		if !ok || username != "test-user" || password != "test-registry-token" {
			w.Header().Set("WWW-Authenticate", `Basic realm="Shipyard fixture"`)
			w.WriteHeader(401)
			return
		}
		authenticated.Add(1)
		switch {
		case r.URL.Path == "/v2/":
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{}`)
		case strings.Contains(r.URL.Path, "/manifests/"):
			w.Header().Set("Content-Type", "application/vnd.docker.distribution.manifest.v2+json")
			w.Header().Set("Docker-Content-Digest", digest(manifest))
			w.Header().Set("Content-Length", fmt.Sprint(len(manifest)))
			if r.Method != "HEAD" {
				_, _ = w.Write(manifest)
			}
		case strings.HasSuffix(r.URL.Path, "/blobs/"+digest(config)):
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("Content-Length", fmt.Sprint(len(config)))
			if r.Method != "HEAD" {
				_, _ = w.Write(config)
			}
		default:
			http.NotFound(w, r)
		}
	})}
	go func() { _ = server.Serve(listener) }()
	defer server.Close()
	r := model.Release{ID: uuid.NewString(), AppID: uuid.NewString(), App: model.App{Source: "compose", Engine: "compose", Context: ".", File: "compose.yaml"}}
	r.Directory = remote.Root + "/releases/" + r.ID
	defer func() {
		cleanup, stop := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer stop()
		_ = node.Run(cleanup, remote.Command("rm", "-rf", r.Directory), nil, io.Discard)
	}()
	var logs strings.Builder
	engine := Engine{Remote: node, Log: &logs}
	source := fmt.Sprintf("services:\n  pulled:\n    image: %s/private:latest\n  built:\n    build:\n      context: .\n      dockerfile_inline: |\n        FROM %s/private:latest\n        LABEL shipyard.fixture=%s\n", registry, registry, r.ID)
	if err = engine.TransferCompose(ctx, &r, source); err != nil {
		t.Fatal(err)
	}
	if err = engine.Build(ctx, &r, nil); err == nil {
		t.Fatal("anonymous private registry build succeeded")
	}
	logs.Reset()
	if err = engine.Build(ctx, &r, map[string]model.RegistryCredential{registry: {Username: "test-user", Password: "test-registry-token"}}); err != nil {
		t.Fatal(err, logs.String())
	}
	if authenticated.Load() == 0 || len(r.Images) != 2 {
		t.Fatal("registry credentials were not used for both services", authenticated.Load(), r.Images)
	}
	if err = node.Run(ctx, remote.Command("test", "!", "-e", r.Directory+"/auth/config.json"), nil, io.Discard); err != nil {
		t.Fatal("credentials remained after build", err)
	}
	if strings.Contains(logs.String(), "test-registry-token") {
		t.Fatal("registry token leaked into build output")
	}
}
