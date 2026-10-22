package deploy

import (
	"context"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"

	"shipyard/internal/model"
	"shipyard/internal/remote"
)

const startupLogLimit = 1 << 20

type startupBudget struct {
	mu        sync.Mutex
	remaining int
	output    io.Writer
	truncated bool
}

func (b *startupBudget) line(line string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.remaining <= 0 {
		if !b.truncated {
			fmt.Fprintln(b.output, "[startup log limit reached; additional live output omitted]")
			b.truncated = true
		}
		return false
	}
	if len(line) > b.remaining {
		fmt.Fprintln(b.output, "[startup log limit reached; additional live output omitted]")
		b.remaining = 0
		b.truncated = true
		return false
	}
	b.remaining -= len(line)
	fmt.Fprintln(b.output, line)
	return true
}

type startupWriter struct {
	mu      sync.Mutex
	pending string
	prefix  string
	last    time.Time
	budget  *startupBudget
	cancel  context.CancelFunc
}

func (w *startupWriter) Write(b []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.pending += string(b)
	for {
		i := strings.IndexByte(w.pending, '\n')
		if i < 0 {
			break
		}
		line := w.pending[:i]
		w.pending = w.pending[i+1:]
		w.line(line)
	}
	if len(w.pending) > 16384 {
		w.line("[oversized container log line omitted]")
		w.pending = ""
	}
	return len(b), nil
}

func (w *startupWriter) line(line string) {
	if stamp, _, ok := strings.Cut(line, " "); ok {
		if at, err := time.Parse(time.RFC3339Nano, stamp); err == nil && at.After(w.last) {
			w.last = at
		}
	}
	if !w.budget.line(w.prefix + line) {
		w.cancel()
	}
}

func (w *startupWriter) flush() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.pending != "" {
		w.line(w.pending)
		w.pending = ""
	}
}

func containerLabel(c container) string {
	service := c.Config.Labels["com.docker.compose.service"]
	replica := c.Config.Labels["com.docker.compose.container-number"]
	id := c.ID
	if len(id) > 12 {
		id = id[:12]
	}
	return fmt.Sprintf("[%s/%s %s] ", service, replica, id)
}

func releaseContainer(r model.Release, c container) bool {
	return c.Config.Labels["shipyard.release"] == r.ID && c.Config.Labels["shipyard.app"] == r.AppID && c.Config.Labels["shipyard.role"] == ""
}

// FollowStartup discovers newly created replicas as startup runs. Followers are
// scoped by immutable release labels and are joined before terminal events.
func (e *Engine) FollowStartup(parent context.Context, r model.Release) func() {
	ctx, cancel := context.WithCancel(parent)
	output := e.Log
	if output == nil {
		output = io.Discard
	}
	budget := &startupBudget{remaining: startupLogLimit, output: output}
	done := make(chan struct{})
	go func() {
		defer close(done)
		var followers sync.WaitGroup
		defer followers.Wait()
		seen := map[string]bool{}
		tick := time.NewTicker(time.Second)
		defer tick.Stop()
		for {
			items, err := e.inspect(ctx, r)
			if err == nil {
				for _, item := range items {
					if seen[item.ID] || !releaseContainer(r, item) {
						continue
					}
					seen[item.ID] = true
					followers.Add(1)
					go func(c container) { defer followers.Done(); e.followContainer(ctx, c, budget) }(item)
				}
			}
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
			}
		}
	}()
	var once sync.Once
	return func() { once.Do(func() { cancel(); <-done }) }
}

func (e *Engine) followContainer(parent context.Context, c container, budget *startupBudget) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	w := &startupWriter{prefix: containerLabel(c), budget: budget, cancel: cancel}
	for ctx.Err() == nil {
		args := []string{"docker", "logs", "--follow", "--timestamps"}
		if w.last.IsZero() {
			args = append(args, "--tail", "100")
		} else {
			args = append(args, "--since", w.last.Add(time.Nanosecond).Format(time.RFC3339Nano))
		}
		args = append(args, c.ID)
		err := e.Remote.Run(ctx, remote.Command(args...), nil, w)
		w.flush()
		if err != nil && ctx.Err() == nil {
			budget.line(containerLabel(c) + "Startup log collection ended: " + err.Error())
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Second):
		}
	}
}

// Diagnostics is best effort and must run before restoring/removing containers.
func (e *Engine) Diagnostics(ctx context.Context, r model.Release) {
	output := e.Log
	if output == nil {
		return
	}
	items, err := e.inspect(ctx, r)
	if err != nil {
		fmt.Fprintf(output, "Startup diagnostics unavailable: %v\n", err)
		return
	}
	for _, c := range items {
		if !releaseContainer(r, c) {
			continue
		}
		fmt.Fprintf(output, "%sstate=%s exit=%d restarts=%d OOM=%t error=%s\n", containerLabel(c), c.State.Status, c.State.ExitCode, c.RestartCount, c.State.OOMKilled, c.State.Error)
		if c.State.Health != nil {
			fmt.Fprintf(output, "%shealth=%s\n", containerLabel(c), c.State.Health.Status)
			for _, entry := range c.State.Health.Log {
				text := entry.Output
				if len(text) > 4096 {
					text = text[:4096] + " [truncated]"
				}
				fmt.Fprintf(output, "%shealth exit=%d: %s\n", containerLabel(c), entry.ExitCode, text)
			}
		}
		budget := &startupBudget{remaining: 64 << 10, output: output}
		logCtx, cancel := context.WithCancel(ctx)
		w := &startupWriter{prefix: containerLabel(c), budget: budget, cancel: cancel}
		err = e.Remote.Run(logCtx, remote.Command("docker", "logs", "--timestamps", "--tail", "100", c.ID), nil, w)
		w.flush()
		cancel()
		if err != nil {
			fmt.Fprintf(output, "%sRecent container logs unavailable: %v\n", containerLabel(c), err)
		}
	}
}
