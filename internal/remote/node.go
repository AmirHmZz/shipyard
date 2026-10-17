package remote

import (
	"context"
	"golang.org/x/crypto/ssh"
	"io"
	"net"
)

// Node supplies the capabilities needed by deployments, regardless of transport.
type Node interface {
	Executor
	DialContext(context.Context, string, string) (net.Conn, error)
	OpenTerminal(context.Context, string, string, int, int) (Terminal, error)
}
type Terminal interface {
	io.ReadWriteCloser
	Resize(int, int) error
	Wait() error
}
type sshTerminal struct {
	session *ssh.Session
	input   io.WriteCloser
	output  *io.PipeReader
	done    chan error
}

func (t *sshTerminal) Read(p []byte) (int, error)  { return t.output.Read(p) }
func (t *sshTerminal) Write(p []byte) (int, error) { return t.input.Write(p) }
func (t *sshTerminal) Close() error                { t.input.Close(); t.output.Close(); return t.session.Close() }
func (t *sshTerminal) Resize(rows, cols int) error { return t.session.WindowChange(rows, cols) }
func (t *sshTerminal) Wait() error                 { return <-t.done }
func (c *Client) OpenTerminal(ctx context.Context, container, shell string, rows, cols int) (Terminal, error) {
	s, e := c.Session(ctx)
	if e != nil {
		return nil, e
	}
	if e = s.RequestPty("xterm-256color", rows, cols, ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 14400, ssh.TTY_OP_OSPEED: 14400}); e != nil {
		s.Close()
		return nil, e
	}
	input, e := s.StdinPipe()
	if e != nil {
		s.Close()
		return nil, e
	}
	reader, writer := io.Pipe()
	output := &lockedWriter{writer: writer}
	s.Stdout = output
	s.Stderr = output
	if e = s.Start(Command("docker", "exec", "-it", container, shell)); e != nil {
		s.Close()
		reader.Close()
		writer.Close()
		return nil, e
	}
	t := &sshTerminal{s, input, reader, make(chan error, 1)}
	go func() { e := s.Wait(); writer.CloseWithError(e); t.done <- e }()
	return t, nil
}
