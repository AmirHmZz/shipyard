package remote

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"errors"
	"net"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
	"shipyard/internal/model"
)

func TestSSHAuthenticationAndFingerprint(t *testing.T) {
	_, hostKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	hostSigner, err := ssh.NewSignerFromKey(hostKey)
	if err != nil {
		t.Fatal(err)
	}
	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	clientSigner, err := ssh.NewSignerFromKey(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	block, err := ssh.MarshalPrivateKey(privateKey, "test")
	if err != nil {
		t.Fatal(err)
	}
	key := string(pem.EncodeToMemory(block))
	for _, tc := range []struct {
		name, method, key, password string
		badFingerprint, wantError   bool
	}{
		{name: "existing key configuration", key: key},
		{name: "explicit key", method: "private_key", key: key, password: "unused"},
		{name: "password ignores stale key", method: "password", key: "invalid old key", password: "test-only-password"},
		{name: "wrong password", method: "password", password: "incorrect", wantError: true},
		{name: "key does not fall back to password", method: "private_key", key: "invalid", password: "test-only-password", wantError: true},
		{name: "missing password", method: "password", wantError: true},
		{name: "unknown method", method: "agent", wantError: true},
		{name: "password rejects changed host key", method: "password", password: "test-only-password", badFingerprint: true, wantError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var passwordAttempts atomic.Int32
			cfg := &ssh.ServerConfig{
				PasswordCallback: func(_ ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
					passwordAttempts.Add(1)
					if string(password) != "test-only-password" {
						return nil, errors.New("authentication rejected")
					}
					return nil, nil
				},
				PublicKeyCallback: func(_ ssh.ConnMetadata, public ssh.PublicKey) (*ssh.Permissions, error) {
					if string(public.Marshal()) != string(clientSigner.PublicKey().Marshal()) {
						return nil, errors.New("key rejected")
					}
					return nil, nil
				},
			}
			cfg.AddHostKey(hostSigner)
			listener, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			defer listener.Close()
			done := make(chan struct{})
			go func() {
				defer close(done)
				conn, err := listener.Accept()
				if err != nil {
					return
				}
				defer conn.Close()
				_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
				server, channels, requests, err := ssh.NewServerConn(conn, cfg)
				if err != nil {
					return
				}
				defer server.Close()
				go ssh.DiscardRequests(requests)
				for channel := range channels {
					_ = channel.Reject(ssh.Prohibited, "not needed")
				}
			}()
			host, port, _ := net.SplitHostPort(listener.Addr().String())
			p, _ := strconv.Atoi(port)
			fingerprint := ssh.FingerprintSHA256(hostSigner.PublicKey())
			if tc.badFingerprint {
				fingerprint = "SHA256:untrusted"
			}
			client, err := Dial(context.Background(), model.Server{Host: host, Port: p, User: "test", Fingerprint: fingerprint, AuthMethod: tc.method}, tc.key, tc.password)
			if client != nil {
				_ = client.Close()
			}
			_ = listener.Close()
			<-done
			if (err != nil) != tc.wantError {
				t.Fatalf("expected error=%v, got %v", tc.wantError, err)
			}
			if tc.badFingerprint && passwordAttempts.Load() != 0 {
				t.Fatal("password sent before host key verification")
			}
			if tc.method != "password" && passwordAttempts.Load() != 0 {
				t.Fatal("key authentication fell back to a password")
			}
		})
	}
}
