package remote

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Docker uses only the local Unix socket. No Docker TCP API is exposed.
type Docker struct {
	Socket, Helper string
	http           *http.Client
}

func NewDocker(socket, helper string) *Docker {
	d := &Docker{Socket: socket, Helper: helper}
	d.http = &http.Client{Transport: &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", socket)
	}}}
	return d
}
func (d *Docker) API(ctx context.Context, method, path string, input, output any) error {
	var body io.Reader
	if input != nil {
		b, e := json.Marshal(input)
		if e != nil {
			return e
		}
		body = bytes.NewReader(b)
	}
	req, e := http.NewRequestWithContext(ctx, method, "http://docker"+path, body)
	if e != nil {
		return e
	}
	req.Header.Set("Content-Type", "application/json")
	res, e := d.http.Do(req)
	if e != nil {
		return e
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 8192))
		return fmt.Errorf("Docker %s: %s", res.Status, strings.TrimSpace(string(b)))
	}
	if output != nil {
		return json.NewDecoder(io.LimitReader(res.Body, 32<<20)).Decode(output)
	}
	return nil
}
func (d *Docker) Identity(ctx context.Context) (string, error) {
	var info struct{ ID string }
	e := d.API(ctx, "GET", "/info", nil, &info)
	if e == nil && info.ID == "" {
		e = errors.New("Docker daemon identity is unavailable")
	}
	return info.ID, e
}
func (d *Docker) Close() error { return nil }

type dockerStream struct {
	net.Conn
	reader *bufio.Reader
	stop   func() bool
}

func (s *dockerStream) Read(p []byte) (int, error) { return s.reader.Read(p) }
func (s *dockerStream) Close() error {
	if s.stop != nil {
		s.stop()
	}
	return s.Conn.Close()
}
func (d *Docker) createExec(ctx context.Context, container string, cmd []string, tty, stdin bool) (string, error) {
	var result struct {
		ID string `json:"Id"`
	}
	e := d.API(ctx, "POST", "/containers/"+url.PathEscape(container)+"/exec", map[string]any{"AttachStdin": stdin, "AttachStdout": true, "AttachStderr": true, "Tty": tty, "Cmd": cmd}, &result)
	return result.ID, e
}
func (d *Docker) startExec(ctx context.Context, id string, tty bool) (*dockerStream, error) {
	conn, e := (&net.Dialer{}).DialContext(ctx, "unix", d.Socket)
	if e != nil {
		return nil, e
	}
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	body := fmt.Sprintf(`{"Detach":false,"Tty":%t}`, tty)
	req, _ := http.NewRequest("POST", "http://docker/exec/"+id+"/start", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "tcp")
	if e = req.Write(conn); e != nil {
		stop()
		conn.Close()
		return nil, e
	}
	reader := bufio.NewReader(conn)
	res, e := http.ReadResponse(reader, req)
	if e != nil {
		stop()
		conn.Close()
		return nil, e
	}
	if res.StatusCode != 101 && res.StatusCode != 200 {
		stop()
		conn.Close()
		return nil, fmt.Errorf("Docker exec attach: %s", res.Status)
	}
	return &dockerStream{conn, reader, stop}, nil
}
func demux(reader io.Reader, stdout, stderr io.Writer) error {
	header := make([]byte, 8)
	for {
		_, e := io.ReadFull(reader, header)
		if e == io.EOF {
			return nil
		}
		if e != nil {
			return e
		}
		n := int64(binary.BigEndian.Uint32(header[4:]))
		if n > 32<<20 {
			return errors.New("Docker output frame too large")
		}
		out := stdout
		if header[0] == 2 {
			out = stderr
		}
		if _, e = io.CopyN(out, reader, n); e != nil {
			return e
		}
	}
}
func (d *Docker) exit(ctx context.Context, id string) error {
	var state struct {
		Running  bool
		ExitCode int
	}
	if e := d.API(ctx, "GET", "/exec/"+id+"/json", nil, &state); e != nil {
		return e
	}
	if state.Running {
		return errors.New("Docker exec is still running")
	}
	if state.ExitCode != 0 {
		return fmt.Errorf("command exited with status %d", state.ExitCode)
	}
	return nil
}
func (d *Docker) raw(ctx context.Context, cmd []string, input io.Reader, stdout, stderr io.Writer) error {
	id, e := d.createExec(ctx, d.Helper, cmd, false, input != nil)
	if e != nil {
		return e
	}
	stream, e := d.startExec(ctx, id, false)
	if e != nil {
		return e
	}
	defer stream.Close()
	if input != nil {
		go func() {
			io.Copy(stream, input)
			if u, ok := stream.Conn.(*net.UnixConn); ok {
				u.CloseWrite()
			}
		}()
	}
	if e = demux(stream, stdout, stderr); e != nil {
		return e
	}
	return d.exit(ctx, id)
}
func (d *Docker) Run(ctx context.Context, command string, input io.Reader, output io.Writer) error {
	if output == nil {
		output = io.Discard
	}
	writer := &lockedWriter{writer: output}
	return d.RunSeparated(ctx, command, input, writer, writer)
}
func (d *Docker) RunSeparated(ctx context.Context, command string, input io.Reader, stdout, stderr io.Writer) error {
	if stdout == nil {
		stdout = io.Discard
	}
	if stderr == nil {
		stderr = io.Discard
	}
	token := uuid.NewString()
	pid := Root + "/exec/" + token
	e := d.raw(ctx, []string{"/usr/local/bin/shipyard-executor", "run", token, command}, input, stdout, stderr)
	cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	script := "rm -f " + Quote(pid)
	if ctx.Err() != nil {
		script = "if [ -f " + Quote(pid) + " ]; then p=$(cat " + Quote(pid) + "); kill -TERM -- -\"$p\" 2>/dev/null || true; fi; " + script
	}
	_ = d.raw(cleanup, []string{"sh", "-c", script}, nil, io.Discard, io.Discard)
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return e
}

type dockerTunnel struct {
	*dockerStream
	read   *io.PipeReader
	once   sync.Once
	cancel context.CancelFunc
}

func (t *dockerTunnel) Read(p []byte) (int, error) { return t.read.Read(p) }
func (t *dockerTunnel) Close() error {
	t.once.Do(func() { t.cancel(); t.read.Close(); t.dockerStream.Close() })
	return nil
}
func (d *Docker) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	if network != "tcp" && network != "unix" {
		return nil, errors.New("unsupported tunnel network")
	}
	ctx, cancel := context.WithCancel(ctx)
	id, e := d.createExec(ctx, d.Helper, []string{"/usr/local/bin/shipyard-executor", "dial", network, address}, false, true)
	if e != nil {
		cancel()
		return nil, e
	}
	stream, e := d.startExec(ctx, id, false)
	if e != nil {
		cancel()
		return nil, e
	}
	reader, writer := io.Pipe()
	go func() { e := demux(stream, writer, io.Discard); writer.CloseWithError(e) }()
	tunnel := &dockerTunnel{dockerStream: stream, read: reader, cancel: cancel}
	// The executor acknowledges a successful connection before application bytes.
	ack := make([]byte, 3)
	if _, e = io.ReadFull(reader, ack); e != nil || string(ack) != "OK\n" {
		tunnel.Close()
		return nil, errors.New("host connection failed")
	}
	// Like net.Dialer, the dialing context controls establishment only. HTTP
	// transports cancel it once the connection is handed to the caller.
	stream.stop()
	stream.stop = nil
	return tunnel, nil
}

type dockerTerminal struct {
	*dockerStream
	docker *Docker
	id     string
	ctx    context.Context
}

func (t *dockerTerminal) Resize(rows, cols int) error {
	return t.docker.API(t.ctx, "POST", fmt.Sprintf("/exec/%s/resize?h=%d&w=%d", t.id, rows, cols), nil, nil)
}
func (t *dockerTerminal) Wait() error {
	for {
		var s struct {
			Running  bool
			ExitCode int
		}
		if e := t.docker.API(t.ctx, "GET", "/exec/"+t.id+"/json", nil, &s); e != nil {
			return e
		}
		if !s.Running {
			return t.docker.exit(t.ctx, t.id)
		}
		select {
		case <-t.ctx.Done():
			return t.ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
}
func (t *dockerTerminal) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var state struct {
		Pid     int
		Running bool
	}
	if t.docker.API(ctx, "GET", "/exec/"+t.id+"/json", nil, &state) == nil && state.Running && state.Pid > 1 {
		_ = t.docker.raw(ctx, []string{"kill", "-HUP", fmt.Sprint(state.Pid)}, nil, io.Discard, io.Discard)
	}
	return t.dockerStream.Close()
}
func (d *Docker) OpenTerminal(ctx context.Context, container, shell string, rows, cols int) (Terminal, error) {
	id, e := d.createExec(ctx, container, []string{shell}, true, true)
	if e != nil {
		return nil, e
	}
	stream, e := d.startExec(ctx, id, true)
	if e != nil {
		return nil, e
	}
	t := &dockerTerminal{stream, d, id, ctx}
	if e = t.Resize(rows, cols); e != nil {
		t.Close()
		return nil, e
	}
	return t, nil
}
