package outbound

import (
	"bufio"
	"context"
	"encoding/binary"
	"io"
	"net"
	"net/http"
	"strconv"
	"testing"
	"time"

	"shipyard/internal/model"
)

func TestSOCKSResolutionAuthenticationAndIsolation(t *testing.T) {
	for _, scheme := range []string{"socks5", "socks5h"} {
		t.Run(scheme, func(t *testing.T) {
			listener, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			defer listener.Close()
			requested := make(chan byte, 1)
			done := make(chan error, 1)
			go func() {
				conn, err := listener.Accept()
				if err != nil {
					done <- err
					return
				}
				defer conn.Close()
				_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
				header := make([]byte, 2)
				if _, err = io.ReadFull(conn, header); err != nil {
					done <- err
					return
				}
				methods := make([]byte, int(header[1]))
				_, _ = io.ReadFull(conn, methods)
				_, _ = conn.Write([]byte{5, 2})
				_, _ = io.ReadFull(conn, header)
				user := make([]byte, int(header[1]))
				_, _ = io.ReadFull(conn, user)
				size := make([]byte, 1)
				_, _ = io.ReadFull(conn, size)
				pass := make([]byte, int(size[0]))
				_, _ = io.ReadFull(conn, pass)
				if string(user) != "test-user" || string(pass) != "test-pass" {
					done <- io.ErrUnexpectedEOF
					return
				}
				_, _ = conn.Write([]byte{1, 0})
				connect := make([]byte, 4)
				_, _ = io.ReadFull(conn, connect)
				requested <- connect[3]
				n := 4
				if connect[3] == 4 {
					n = 16
				}
				if connect[3] == 3 {
					_, _ = io.ReadFull(conn, size)
					n = int(size[0])
				}
				target := make([]byte, n+2)
				_, _ = io.ReadFull(conn, target)
				if binary.BigEndian.Uint16(target[n:]) != 80 {
					done <- io.ErrUnexpectedEOF
					return
				}
				_, _ = conn.Write([]byte{5, 0, 0, 1, 127, 0, 0, 1, 0, 80})
				req, err := http.ReadRequest(bufio.NewReader(conn))
				if err == nil {
					req.Body.Close()
					_, err = io.WriteString(conn, "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
				}
				done <- err
			}()
			host, port, _ := net.SplitHostPort(listener.Addr().String())
			n, _ := strconv.Atoi(port)
			transport, err := Transport(&model.OutboundProxy{Scheme: scheme, Host: host, Port: n}, "test-user", "test-pass")
			if err != nil {
				t.Fatal(err)
			}
			defer transport.CloseIdleConnections()
			client := &http.Client{Transport: transport, Timeout: 5 * time.Second}
			target := "http://localhost/"
			expected := byte(1)
			if scheme == "socks5h" {
				target = "http://unresolvable.example.invalid/"
				expected = 3
			}
			res, err := client.Get(target)
			if err != nil {
				t.Fatal(err)
			}
			res.Body.Close()
			addressType := <-requested
			if scheme == "socks5" && addressType == 4 {
				expected = 4
			}
			if addressType != expected {
				t.Fatalf("unexpected SOCKS address type %d", addressType)
			}
			if err = <-done; err != nil {
				t.Fatal(err)
			}
		})
	}
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:1")
	transport, err := Transport(nil, "", "")
	if err != nil || transport.Proxy != nil {
		t.Fatal("direct transport inherited environment proxy", err)
	}
}
func TestSOCKSCancellationAndNoFallback(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	go func() {
		conn, e := listener.Accept()
		if e == nil {
			defer conn.Close()
			_, _ = io.Copy(io.Discard, conn)
		}
	}()
	host, port, _ := net.SplitHostPort(listener.Addr().String())
	n, _ := strconv.Atoi(port)
	transport, err := Transport(&model.OutboundProxy{Scheme: "socks5h", Host: host, Port: n}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	defer transport.CloseIdleConnections()
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err = transport.DialContext(ctx, "tcp", "example.com:443"); err == nil {
		t.Fatal("cancellation ignored")
	}
}
