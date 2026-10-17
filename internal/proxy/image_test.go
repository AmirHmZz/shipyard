package proxy

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"regexp"
	"strings"
	"testing"
)

type imageFixture struct {
	existing, cached    bool
	version, generation string
	commands            []string
}

func (f *imageFixture) Close() error { return nil }
func (f *imageFixture) RunSeparated(ctx context.Context, command string, input io.Reader, stdout, _ io.Writer) error {
	return f.Run(ctx, command, input, stdout)
}
func (f *imageFixture) Run(_ context.Context, command string, input io.Reader, output io.Writer) error {
	f.commands = append(f.commands, command)
	if output == nil {
		output = io.Discard
	}
	switch {
	case strings.Contains(command, "{{.Image}}"):
		if f.existing {
			fmt.Fprint(output, "sha256:running-image")
		}
	case strings.Contains(command, "{{.Id}}"):
		if f.cached {
			fmt.Fprint(output, "sha256:resolved-image")
		}
	case strings.Contains(command, "'docker' 'pull'"):
		f.cached = true
	case strings.HasSuffix(command, "'haproxy' '-v'"):
		fmt.Fprint(output, "HAProxy version "+f.version)
	case strings.Contains(command, "'id' '-u'"):
		fmt.Fprint(output, "1000")
	}
	if input != nil {
		raw, _ := io.ReadAll(input)
		m := regexp.MustCompile(`setenv SHIPYARD_GENERATION (\S+)`).FindStringSubmatch(string(raw))
		if len(m) > 1 {
			f.generation = m[1]
		}
	}
	return nil
}
func (f *imageFixture) DialContext(context.Context, string, string) (net.Conn, error) {
	client, server := net.Pipe()
	go func() {
		defer server.Close()
		_, _ = bufio.NewReader(server).ReadString('\n')
		_, _ = io.WriteString(server, "SHIPYARD_GENERATION="+f.generation+"\n")
	}()
	return client, nil
}
func TestApplyValidatesExactRuntimeImage(t *testing.T) {
	for _, existing := range []bool{true, false} {
		f := &imageFixture{existing: existing, version: "3.4.7-test"}
		cfg, err := Render(nil)
		if err != nil {
			t.Fatal(err)
		}
		if err = Apply(context.Background(), f, cfg, nil, io.Discard); err != nil {
			t.Fatal(err)
		}
		expected := "sha256:resolved-image"
		if existing {
			expected = "sha256:running-image"
		}
		checked, launched := false, false
		for _, command := range f.commands {
			if strings.Contains(command, "'haproxy' '-c'") {
				checked = strings.Contains(command, expected)
			}
			if strings.Contains(command, "docker run -d --name shipyard-haproxy") {
				launched = strings.Contains(command, expected)
			}
		}
		if !checked || !launched {
			t.Fatal("validation and launch did not use the resolved runtime image", f.commands)
		}
	}
	f := &imageFixture{existing: true, version: "3.2.1-old"}
	if err := Apply(context.Background(), f, "global\n", nil, io.Discard); err == nil || !strings.Contains(err.Error(), "recreate") {
		t.Fatal("older container was silently updated", err)
	}
	for _, command := range f.commands {
		if strings.Contains(command, "USR2") {
			t.Fatal("unsupported version was reloaded")
		}
	}
}
