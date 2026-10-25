package control

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"shipyard/internal/model"
	"shipyard/internal/remote"
)

func TestControlPlaneNetworkRestoreRetryAndDetach(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	raw, _ := json.Marshal(model.Server{Connection: "local", DaemonID: "engine"})
	if _, err := c.Store.Save(ctx, LocalServerID, model.ResourceInput{Kind: "server", Name: "Local host", Data: raw}); err != nil {
		t.Fatal(err)
	}
	n := resource(t, c, "network", LocalServerID, "", model.Network{ServerID: LocalServerID, Managed: true, DockerID: "bridge-id", DockerName: "shared", Status: "ready"}, nil)
	var mu sync.Mutex
	core, attached, fail, connects, disconnects := "core-1", false, false, 0, 0
	mode, owner, role, daemon := "default-network", n.ID, "control-plane", "engine"
	socket := filepath.Join(t.TempDir(), "docker.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/info":
			json.NewEncoder(w).Encode(map[string]string{"ID": daemon})
		case r.URL.Path == "/containers/"+core+"/json":
			networks := map[string]any{"default-network": map[string]string{"NetworkID": "default-id"}}
			if attached {
				networks["shared"] = map[string]string{"NetworkID": "bridge-id"}
			}
			json.NewEncoder(w).Encode(map[string]any{"Id": core, "Config": map[string]any{"Labels": map[string]string{"shipyard.role": role}}, "State": map[string]bool{"Running": true}, "HostConfig": map[string]string{"NetworkMode": mode}, "NetworkSettings": map[string]any{"Networks": networks}})
		case r.URL.Path == "/networks/bridge-id":
			json.NewEncoder(w).Encode(map[string]any{"Id": "bridge-id", "Name": "shared", "Driver": "bridge", "Labels": map[string]string{"shipyard.network": owner}})
		case r.URL.Path == "/networks/bridge-id/connect" || r.URL.Path == "/networks/bridge-id/disconnect":
			var in struct {
				Container      string
				EndpointConfig struct{ GwPriority int }
			}
			if r.Method != "POST" || json.NewDecoder(r.Body).Decode(&in) != nil || in.Container != core {
				http.Error(w, "unexpected attachment target", 400)
				return
			}
			if fail {
				http.Error(w, "temporary Docker failure", 500)
				return
			}
			if strings.HasSuffix(r.URL.Path, "/connect") && in.EndpointConfig.GwPriority != -1 {
				t.Error("attachment can replace the installation gateway")
			}
			attached = strings.HasSuffix(r.URL.Path, "/connect")
			if attached {
				connects++
			} else {
				disconnects++
			}
			w.WriteHeader(200)
		default:
			t.Errorf("unexpected Docker request: %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}
	})}
	go server.Serve(listener)
	t.Cleanup(func() { server.Close() })
	c.Local = remote.NewDocker(socket, "executor")
	c.SelfContainer = "core-1"
	status, err := c.SetControlPlaneNetwork(ctx, n.ID, true)
	if err != nil || !status.Desired || !status.Attached || status.Error != "" {
		t.Fatalf("attach: %+v %v", status, err)
	}
	if _, err = c.SetControlPlaneNetwork(ctx, n.ID, true); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	if connects != 1 {
		t.Error("repeat attachment changed Docker")
	}
	core, attached = "core-2", false
	mu.Unlock()
	// A new controller has no prior container ID or in-memory selections.
	restarted := &Controller{Store: c.Store, Local: c.Local, SelfContainer: "core-2"}
	if err = restarted.ReconcileControlPlaneNetworks(ctx); err != nil {
		t.Fatal(err)
	}
	state, err := restarted.ControlPlaneNetworkStatus(ctx)
	if err != nil || len(state.Networks) != 1 || !state.Networks[0].Attached {
		t.Fatalf("recreation lost attachment: %+v %v", state, err)
	}
	if err = restarted.DeleteNetwork(ctx, n); err == nil || !strings.Contains(err.Error(), "detach Shipyard") {
		t.Fatal("selected network deletion was allowed", err)
	}
	mu.Lock()
	fail = true
	mu.Unlock()
	status, err = restarted.SetControlPlaneNetwork(ctx, n.ID, false)
	if err != nil || status.Desired || !status.Attached || !strings.Contains(status.Error, "temporary Docker failure") {
		t.Fatalf("failed detach intent: %+v %v", status, err)
	}
	mu.Lock()
	fail = false
	mu.Unlock()
	if err = restarted.ReconcileControlPlaneNetworks(ctx); err != nil {
		t.Fatal(err)
	}
	state, err = restarted.ControlPlaneNetworkStatus(ctx)
	if err != nil || state.Networks[0].Attached || state.Networks[0].Desired || state.Networks[0].Error != "" {
		t.Fatalf("detach retry: %+v %v", state, err)
	}
	mu.Lock()
	if connects != 2 || disconnects != 1 {
		t.Error("unexpected network mutations", connects, disconnects)
	}
	fail = true
	mu.Unlock()
	status, err = restarted.SetControlPlaneNetwork(ctx, n.ID, true)
	if err != nil || !status.Desired || status.Attached || status.Error == "" {
		t.Fatalf("failed attach intent: %+v %v", status, err)
	}
	// Cancelling a failed attachment must not require another Docker mutation.
	status, err = restarted.SetControlPlaneNetwork(ctx, n.ID, false)
	if err != nil || status.Desired || status.Attached || status.Error != "" {
		t.Fatalf("cancel failed attachment: %+v %v", status, err)
	}
	status, err = restarted.SetControlPlaneNetwork(ctx, n.ID, true)
	if err != nil || !status.Desired || status.Error == "" {
		t.Fatalf("restore failed attachment intent: %+v %v", status, err)
	}
	mu.Lock()
	fail = false
	mu.Unlock()
	if err = restarted.ReconcileControlPlaneNetworks(ctx); err != nil {
		t.Fatal(err)
	}
	state, err = restarted.ControlPlaneNetworkStatus(ctx)
	if err != nil || !state.Networks[0].Attached || state.Networks[0].Error != "" {
		t.Fatalf("attach retry: %+v %v", state, err)
	}
	// Every request rechecks the host, control container and target network.
	for _, invalid := range []string{"installation", "ownership", "container", "daemon"} {
		mu.Lock()
		switch invalid {
		case "installation":
			mode = "shared"
		case "ownership":
			owner = "other-resource"
		case "container":
			role = "application"
		case "daemon":
			daemon = "different-engine"
		}
		mu.Unlock()
		if status, err = restarted.SetControlPlaneNetwork(ctx, n.ID, false); err == nil && status.Error == "" {
			t.Error("unsafe detach accepted:", invalid)
		}
		mu.Lock()
		mode, owner, role, daemon = "default-network", n.ID, "control-plane", "engine"
		mu.Unlock()
	}
	for _, spec := range []model.Network{{ServerID: "remote", DockerID: "bridge-id"}, {ServerID: LocalServerID, IngressApp: "application", DockerID: "bridge-id"}} {
		r := resource(t, c, "network", LocalServerID, "", spec, nil)
		if _, err = restarted.SetControlPlaneNetwork(ctx, r.ID, true); err == nil {
			t.Error("remote or ingress attachment accepted")
		}
	}
}
