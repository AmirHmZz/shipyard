package remote

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestDockerExecTransportAndCancellation(t *testing.T) {
	if os.PathSeparator == '\\' {
		t.Skip("Unix socket transport")
	}
	socket := filepath.Join(t.TempDir(), "docker.sock")
	listener, e := net.Listen("unix", socket)
	if e != nil {
		t.Fatal(e)
	}
	var mu sync.Mutex
	commands := map[string][]string{}
	next := 0
	frame := func(w io.Writer, kind byte, value string) {
		h := make([]byte, 8)
		h[0] = kind
		binary.BigEndian.PutUint32(h[4:], uint32(len(value)))
		w.Write(h)
		io.WriteString(w, value)
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/info" {
			io.WriteString(w, `{"ID":"verified"}`)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/exec") {
			var in struct{ Cmd []string }
			json.NewDecoder(r.Body).Decode(&in)
			mu.Lock()
			next++
			id := strings.Repeat("x", next)
			commands[id] = in.Cmd
			mu.Unlock()
			json.NewEncoder(w).Encode(map[string]string{"Id": id})
			return
		}
		id := strings.Split(r.URL.Path, "/")[2]
		mu.Lock()
		cmd := commands[id]
		mu.Unlock()
		if strings.HasSuffix(r.URL.Path, "/json") {
			io.WriteString(w, `{"Running":false,"ExitCode":0}`)
			return
		}
		conn, buffer, _ := w.(http.Hijacker).Hijack()
		defer conn.Close()
		buffer.WriteString("HTTP/1.1 101 UPGRADED\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n")
		buffer.Flush()
		if len(cmd) > 1 && cmd[1] == "run" {
			if strings.Contains(cmd[len(cmd)-1], "block") {
				io.Copy(io.Discard, conn)
				return
			}
			frame(conn, 1, "stdout")
			frame(conn, 2, "stderr")
		}
	})}
	go server.Serve(listener)
	t.Cleanup(func() { server.Close() })
	d := NewDocker(socket, "helper")
	if id, e := d.Identity(context.Background()); e != nil || id != "verified" {
		t.Fatal(id, e)
	}
	var out, errout bytes.Buffer
	if e = d.RunSeparated(context.Background(), "echo test", nil, &out, &errout); e != nil || out.String() != "stdout" || errout.String() != "stderr" {
		t.Fatal(out.String(), errout.String(), e)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	start := time.Now()
	if e = d.Run(ctx, "block", nil, io.Discard); e != context.DeadlineExceeded || time.Since(start) > 2*time.Second {
		t.Fatal("exec cancellation", e)
	}
	mu.Lock()
	defer mu.Unlock()
	killed := false
	for _, cmd := range commands {
		if len(cmd) > 2 && strings.Contains(cmd[2], "kill -TERM") {
			killed = true
		}
	}
	if !killed {
		t.Fatal("cancelled process group was not terminated")
	}
}
func TestDockerDemuxRejectsIncompleteFrame(t *testing.T) {
	if e := demux(bytes.NewReader([]byte{1, 0}), io.Discard, io.Discard); e == nil {
		t.Fatal("incomplete output frame accepted")
	}
}
