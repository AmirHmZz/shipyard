// Package testproxy provides a real, local SOCKS5 tunnel for network tests.
package testproxy

import (
	"encoding/binary"
	"io"
	"net"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"shipyard/internal/model"
)

func Start(t *testing.T) (model.OutboundProxy, *atomic.Int64) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	connections := map[net.Conn]bool{}
	count := &atomic.Int64{}
	track := func(conn net.Conn) { mu.Lock(); connections[conn] = true; mu.Unlock() }
	t.Cleanup(func() {
		listener.Close()
		mu.Lock()
		for conn := range connections {
			conn.Close()
		}
		mu.Unlock()
		wg.Wait()
	})
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			track(conn)
			wg.Add(1)
			go func() {
				defer wg.Done()
				defer conn.Close()
				_ = conn.SetDeadline(time.Now().Add(30 * time.Second))
				h := make([]byte, 2)
				if _, err := io.ReadFull(conn, h); err != nil {
					return
				}
				methods := make([]byte, int(h[1]))
				if _, err := io.ReadFull(conn, methods); err != nil {
					return
				}
				if _, err := conn.Write([]byte{5, 0}); err != nil {
					return
				}
				request := make([]byte, 4)
				if _, err := io.ReadFull(conn, request); err != nil {
					return
				}
				size := 4
				switch request[3] {
				case 4:
					size = 16
				case 3:
					b := make([]byte, 1)
					if _, err := io.ReadFull(conn, b); err != nil {
						return
					}
					size = int(b[0])
				}
				address := make([]byte, size+2)
				if _, err := io.ReadFull(conn, address); err != nil {
					return
				}
				host := string(address[:size])
				if request[3] != 3 {
					host = net.IP(address[:size]).String()
				}
				remote, err := net.DialTimeout("tcp", net.JoinHostPort(host, strconv.Itoa(int(binary.BigEndian.Uint16(address[size:])))), 5*time.Second)
				if err != nil {
					_, _ = conn.Write([]byte{5, 5, 0, 1, 0, 0, 0, 0, 0, 0})
					return
				}
				defer remote.Close()
				track(remote)
				count.Add(1)
				if _, err = conn.Write([]byte{5, 0, 0, 1, 127, 0, 0, 1, 0, 0}); err != nil {
					return
				}
				copied := make(chan struct{})
				go func() { io.Copy(remote, conn); remote.Close(); close(copied) }()
				io.Copy(conn, remote)
				conn.Close()
				<-copied
			}()
		}
	}()
	host, port, _ := net.SplitHostPort(listener.Addr().String())
	number, _ := strconv.Atoi(port)
	return model.OutboundProxy{Scheme: "socks5h", Host: host, Port: number}, count
}
