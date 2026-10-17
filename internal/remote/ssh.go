package remote

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"shipyard/internal/model"
)

type Executor interface {
	Run(context.Context, string, io.Reader, io.Writer) error
	RunSeparated(context.Context, string, io.Reader, io.Writer, io.Writer) error
	Close() error
}
type Client struct{ SSH *ssh.Client }

// SSH copies stdout and stderr on separate goroutines. Writers such as
// bytes.Buffer and strings.Builder require serialization even for one command.
type lockedWriter struct {
	mu     sync.Mutex
	writer io.Writer
}

func (w *lockedWriter) Write(b []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.writer.Write(b)
}

func Quote(s string) string { return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'" }
func Command(args ...string) string {
	q := make([]string, len(args))
	for i, a := range args {
		q[i] = Quote(a)
	}
	return strings.Join(q, " ")
}
func Dial(ctx context.Context, s model.Server, key, password string) (*Client, error) {
	var auth ssh.AuthMethod
	switch s.AuthMethod {
	case "password":
		if password == "" {
			return nil, errors.New("SSH password is required")
		}
		auth = ssh.Password(password)
	case "", "private_key":
		signer, e := ssh.ParsePrivateKey([]byte(key))
		if e != nil {
			return nil, fmt.Errorf("parse SSH key: %w", e)
		}
		auth = ssh.PublicKeys(signer)
	default:
		return nil, errors.New("unsupported SSH authentication method")
	}
	config := &ssh.ClientConfig{User: s.User, Auth: []ssh.AuthMethod{auth}, Timeout: 15 * time.Second, HostKeyCallback: func(_ string, _ net.Addr, key ssh.PublicKey) error {
		if ssh.FingerprintSHA256(key) != s.Fingerprint {
			return errors.New("SSH host fingerprint mismatch; verify the server key before reconnecting")
		}
		return nil
	}}
	address := net.JoinHostPort(s.Host, strconv.Itoa(s.Port))
	d := net.Dialer{Timeout: 15 * time.Second}
	conn, e := d.DialContext(ctx, "tcp", address)
	if e != nil {
		return nil, e
	}
	_ = conn.SetDeadline(time.Now().Add(20 * time.Second))
	c, ch, req, e := ssh.NewClientConn(conn, address, config)
	if e != nil {
		conn.Close()
		return nil, e
	}
	_ = conn.SetDeadline(time.Time{})
	return &Client{ssh.NewClient(c, ch, req)}, nil
}

// Fingerprint probes the key without sending credentials. Users must verify it independently.
func Fingerprint(ctx context.Context, host string, port int) (string, error) {
	if host == "" || port < 1 || port > 65535 {
		return "", errors.New("valid host and port required")
	}
	address := net.JoinHostPort(host, strconv.Itoa(port))
	d := net.Dialer{Timeout: 10 * time.Second}
	conn, e := d.DialContext(ctx, "tcp", address)
	if e != nil {
		return "", e
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	found := ""
	cfg := &ssh.ClientConfig{User: "fingerprint-probe", HostKeyCallback: func(_ string, _ net.Addr, k ssh.PublicKey) error {
		found = ssh.FingerprintSHA256(k)
		return errors.New("probe complete")
	}}
	_, _, _, _ = ssh.NewClientConn(conn, address, cfg)
	if found == "" {
		return "", errors.New("server did not present an SSH host key")
	}
	return found, nil
}
func (c *Client) Run(ctx context.Context, command string, input io.Reader, output io.Writer) error {
	if output == nil {
		output = io.Discard
	}
	writer := &lockedWriter{writer: output}
	return c.RunSeparated(ctx, command, input, writer, writer)
}

// Structured command output must not include stderr warnings or diagnostics.
func (c *Client) RunSeparated(ctx context.Context, command string, input io.Reader, stdout, stderr io.Writer) error {
	s, e := c.Session(ctx)
	if e != nil {
		return e
	}
	defer s.Close()
	s.Stdin = input
	if stdout == nil {
		stdout = io.Discard
	}
	if stderr == nil {
		stderr = io.Discard
	}
	s.Stdout = stdout
	s.Stderr = stderr
	done := make(chan error, 1)
	go func() { done <- s.Run(command) }()
	select {
	case e := <-done:
		return e
	case <-ctx.Done():
		_ = s.Signal(ssh.SIGTERM)
		s.Close()
		<-done
		return ctx.Err()
	}
}

func (c *Client) Session(ctx context.Context) (*ssh.Session, error) {
	type result struct {
		session *ssh.Session
		err     error
	}
	done := make(chan result, 1)
	go func() { s, err := c.SSH.NewSession(); done <- result{s, err} }()
	select {
	case v := <-done:
		return v.session, v.err
	case <-ctx.Done():
		_ = c.SSH.Close()
		go func() {
			v := <-done
			if v.session != nil {
				v.session.Close()
			}
		}()
		return nil, ctx.Err()
	}
}
func (c *Client) Output(ctx context.Context, args ...string) (string, error) {
	return Output(ctx, c, args...)
}

func Output(ctx context.Context, executor Executor, args ...string) (string, error) {
	var stdout, stderr bytes.Buffer
	err := executor.RunSeparated(ctx, Command(args...), nil, &stdout, &stderr)
	if stdout.Len() > 16<<20 || stderr.Len() > 16<<20 {
		return "", errors.New("remote output limit exceeded")
	}
	if err != nil {
		// Never include stdout: it can contain rendered configuration or secrets.
		if diagnostic := strings.TrimSpace(stderr.String()); diagnostic != "" {
			if len(diagnostic) > 8192 {
				diagnostic = diagnostic[:8192] + " [truncated]"
			}
			err = fmt.Errorf("%w: %s", err, diagnostic)
		}
	}
	return stdout.String(), err
}
func (c *Client) Close() error { return c.SSH.Close() }
func (c *Client) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	type result struct {
		conn net.Conn
		err  error
	}
	done := make(chan result, 1)
	go func() { conn, err := c.SSH.Dial(network, address); done <- result{conn, err} }()
	select {
	case v := <-done:
		return v.conn, v.err
	case <-ctx.Done():
		go func() {
			v := <-done
			if v.conn != nil {
				v.conn.Close()
			}
		}()
		return nil, ctx.Err()
	}
}
func (c *Client) Write(ctx context.Context, path string, contents []byte, mode string) error {
	if mode != "600" && mode != "644" && mode != "700" {
		return errors.New("unsupported file mode")
	}
	return c.Run(ctx, "umask 077; cat > "+Quote(path)+" && chmod "+mode+" "+Quote(path), bytes.NewReader(contents), io.Discard)
}

const Root = "/var/lib/shipyard"
const Provision = `set -eu
[ "$(id -u)" = 0 ] || { echo 'Provisioning requires root SSH access'; exit 1; }
. /etc/os-release
case "$ID" in debian|ubuntu) ;; *) echo 'Only Debian/Ubuntu are supported'; exit 1;; esac
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1 || ! docker buildx version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$(dpkg --print-architecture)" "$ID" "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
install -m 0700 -d /var/lib/shipyard /var/lib/shipyard/releases /var/lib/shipyard/apps /var/lib/shipyard/proxy /var/lib/shipyard/proxy/certs /var/lib/shipyard/locks
docker compose version
docker buildx version
docker info --format '{{.OSType}}'
`
