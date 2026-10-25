package control

import (
	"context"
	"io"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"shipyard/internal/model"
	"shipyard/internal/remote"
)

func TestLinuxMonitoringSSHAndDockerCounters(t *testing.T) {
	if os.Getenv("SHIPYARD_INTEGRATION") != "1" {
		t.Skip("requires isolated SSH Docker fixture")
	}
	host := os.Getenv("SHIPYARD_FIXTURE_HOST")
	key, err := os.ReadFile(os.Getenv("SHIPYARD_FIXTURE_PRIVATE_KEY_FILE"))
	if err != nil {
		t.Fatal(err)
	}
	c := testController(t)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	fingerprint, err := remote.Fingerprint(ctx, host, 2222)
	if err != nil {
		t.Fatal(err)
	}
	server := resource(t, c, "server", "", "", model.Server{Host: host, Port: 2222, User: "root", AuthMethod: "private_key", Fingerprint: fingerprint}, map[string]string{"private_key": string(key)})
	first, node := c.collectMetrics(ctx, server.ID)
	if node != nil {
		defer node.Close()
	}
	if !first.Online || !first.Valid || first.MemoryTotalBytes == 0 || len(first.Network) == 0 {
		t.Fatalf("host collection failed: %#v", first)
	}
	// A second observation must turn cumulative counters into valid rates.
	time.Sleep(100 * time.Millisecond)
	second, next := c.collectMetrics(ctx, server.ID)
	if next != nil {
		defer next.Close()
	}
	if !second.CPUValid || !second.Online || len(second.Network) == 0 || second.Network[0].Read == nil {
		t.Fatalf("rate collection failed: %#v", second)
	}
	if second.Status == "degraded" {
		t.Fatal("Docker API could not be read through SSH Unix socket")
	}
	if err = c.metrics(ctx, server.ID); err != nil {
		t.Fatal(err)
	}
	points, err := c.MetricHistory(ctx, server.ID, "1h")
	if err != nil || len(points) != 1 {
		t.Fatal(points, err)
	}
	if os.Getenv("SHIPYARD_LOCAL_MONITORING_TEST") == "1" {
		// Forward a test-only Unix socket to the isolated daemon over SSH. The
		// local driver then exercises its real Docker exec/tunnel code paths.
		socket := filepath.Join(t.TempDir(), "docker.sock")
		listener, err := net.Listen("unix", socket)
		if err != nil {
			t.Fatal(err)
		}
		defer listener.Close()
		go func() {
			for {
				conn, err := listener.Accept()
				if err != nil {
					return
				}
				go func() {
					defer conn.Close()
					peer, err := node.DialContext(ctx, "unix", "/var/run/docker.sock")
					if err != nil {
						return
					}
					defer peer.Close()
					done := make(chan struct{})
					go func() { io.Copy(peer, conn); peer.Close(); close(done) }()
					io.Copy(conn, peer)
					conn.Close()
					<-done
				}()
			}
		}()
		c.Local = remote.NewDocker(socket, "shipyard-host-executor")
		identity, err := c.Local.Identity(ctx)
		if err != nil {
			t.Fatal(err)
		}
		raw := []byte(`{"connection":"local","daemonId":"` + identity + `"}`)
		if _, err = c.Store.Save(ctx, LocalServerID, model.ResourceInput{Kind: "server", Name: "Local Docker", Data: raw}); err != nil {
			t.Fatal(err)
		}
		local, localNode := c.collectMetrics(ctx, LocalServerID)
		if localNode != nil {
			defer localNode.Close()
		}
		if !local.Online || !local.Valid || local.Status != "online" || local.MemoryTotalBytes == 0 || len(local.Containers) == 0 {
			t.Fatalf("local executor collection failed: %#v", local)
		}
	}
}
