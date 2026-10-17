package platformupdate

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"net"
	"net/http"
	"path/filepath"
	"shipyard/internal/remote"
	"strings"
	"sync"
	"testing"
)

func TestProtectedLauncherUsesInstalledExecutorAndRejectsMixedImages(t *testing.T) {
	for _, mixed := range []bool{false, true} {
		t.Run(map[bool]string{false: "matching", true: "mixed"}[mixed], func(t *testing.T) {
			service, i, _ := fixture(t)
			service.Self = "core"
			service.DatabaseURL = "postgres://shipyard:test@postgres:5432/shipyard?sslmode=disable"
			var created map[string]any
			var mu sync.Mutex
			started := false
			id := uuid.NewString()
			socket := filepath.Join(t.TempDir(), "docker.sock")
			ln, e := net.Listen("unix", socket)
			if e != nil {
				t.Fatal(e)
			}
			server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				mu.Lock()
				defer mu.Unlock()
				send := func(v any) { json.NewEncoder(w).Encode(v) }
				switch {
				case r.URL.Path == "/info":
					send(map[string]string{"ID": i.DaemonID})
				case r.URL.Path == "/containers/core/json":
					image := "sha256:core"
					if mixed {
						image = "sha256:wrong"
					}
					send(map[string]any{"Image": image, "Name": "/" + i.ControlContainer, "Config": map[string]any{"Labels": map[string]string{"shipyard.role": "control-plane"}}, "Mounts": []any{map[string]string{"Source": i.Directory, "Destination": "/installation", "Type": "bind"}}})
				case r.URL.Path == "/containers/"+i.ExecutorContainer+"/json":
					send(map[string]any{"Image": "sha256:helper", "Config": map[string]any{"Labels": map[string]string{"shipyard.role": "executor"}}})
				case strings.HasPrefix(r.URL.Path, "/images/"):
					image := "sha256:core"
					if strings.Contains(r.URL.Path, "shipyard-executor") {
						image = "sha256:helper"
					}
					send(map[string]string{"Id": image})
				case r.URL.Path == "/containers/shipyard-postgres-1/json":
					send(map[string]any{"Config": map[string]any{"Labels": map[string]string{"com.docker.compose.project": "shipyard", "com.docker.compose.service": "postgres"}}, "NetworkSettings": map[string]any{"Networks": map[string]any{"private": map[string]string{"IPAddress": "172.18.0.5"}}}})
				case r.URL.Path == "/containers/create":
					json.NewDecoder(r.Body).Decode(&created)
					send(map[string]string{"Id": "updater"})
				case r.URL.Path == "/containers/updater/start":
					started = true
					w.WriteHeader(204)
				default:
					http.NotFound(w, r)
				}
			})}
			go server.Serve(ln)
			defer server.Close()
			service.Local = remote.NewDocker(socket, i.ExecutorContainer)
			e = service.launch(context.Background(), Operation{ID: id, State: "queued"})
			mu.Lock()
			defer mu.Unlock()
			if mixed {
				if e == nil || created != nil {
					t.Fatal("mixed image installation accepted")
				}
				return
			}
			if e != nil {
				t.Fatal(e)
			}
			if !started || created["Image"] != i.Release.ExecutorImage {
				t.Fatal("wrong updater image", created)
			}
			config := created["HostConfig"].(map[string]any)
			if config["NetworkMode"] != "host" || config["VolumesFrom"].([]any)[0] != i.ControlContainer || config["PortBindings"] != nil {
				t.Fatal("updater does not survive component replacement or exposes ports", config)
			}
			raw, _ := json.Marshal(created)
			if strings.Contains(string(raw), "passphrase") {
				t.Fatal("backup passphrase was passed to Docker")
			}
		})
	}
}
