package remote

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"io"
	"net"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

func commandClient(t *testing.T, stdout, stderr string, status uint32) *Client {
	t.Helper()
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(key)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &ssh.ServerConfig{NoClientAuth: true}
	cfg.AddHostKey(signer)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
		server, channels, requests, err := ssh.NewServerConn(conn, cfg)
		if err != nil {
			return
		}
		defer server.Close()
		go ssh.DiscardRequests(requests)
		for incoming := range channels {
			channel, requests, err := incoming.Accept()
			if err != nil {
				return
			}
			for req := range requests {
				if req.Type != "exec" {
					_ = req.Reply(false, nil)
					continue
				}
				_ = req.Reply(true, nil)
				// Deliberately write stderr first, like Compose's version warning.
				_, _ = io.WriteString(channel.Stderr(), stderr)
				_, _ = io.WriteString(channel, stdout)
				_, _ = channel.SendRequest("exit-status", false, ssh.Marshal(struct{ Status uint32 }{status}))
				_ = channel.Close()
				break
			}
		}
	}()
	client, err := ssh.Dial("tcp", listener.Addr().String(), &ssh.ClientConfig{User: "test", HostKeyCallback: ssh.InsecureIgnoreHostKey(), Timeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	return &Client{SSH: client}
}

func TestOutputSeparatesWarningsFromStructuredStdout(t *testing.T) {
	client := commandClient(t, `{"services":{"web":{"image":"nginx"}}}`, `time="2026-10-15" level=warning msg="the attribute version is obsolete"`+"\n", 0)
	out, err := client.Output(context.Background(), "docker", "compose", "config", "--format", "json")
	if err != nil || !json.Valid([]byte(out)) || strings.Contains(out, "warning") {
		t.Fatal(out, err)
	}
}

func TestOutputFailureIncludesStderrWithoutSensitiveStdout(t *testing.T) {
	client := commandClient(t, "private-rendered-configuration", "invalid published port\n", 1)
	_, err := client.Output(context.Background(), "docker", "compose", "config")
	if err == nil || !strings.Contains(err.Error(), "invalid published port") || strings.Contains(err.Error(), "private-rendered") {
		t.Fatal(err)
	}
}

func TestRunStillStreamsBothOutputs(t *testing.T) {
	client := commandClient(t, "build output\n", "build diagnostic\n", 0)
	var combined bytes.Buffer
	if err := client.Run(context.Background(), "build", nil, &combined); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(combined.String(), "build output") || !strings.Contains(combined.String(), "build diagnostic") {
		t.Fatal(combined.String())
	}
}
