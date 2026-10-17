package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"shipyard/internal/control"
	"shipyard/internal/model"
	"shipyard/internal/remote"
	"shipyard/internal/secure"
)

func sse(w http.ResponseWriter) bool {
	if _, ok := w.(http.Flusher); !ok {
		fail(w, 500, "Streaming unavailable")
		return false
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	return true
}
func sendEvent(w http.ResponseWriter, event string, id int64, value any) {
	b, _ := json.Marshal(value)
	if id > 0 {
		_, _ = fmt.Fprintf(w, "id: %d\n", id)
	}
	_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b)
	w.(http.Flusher).Flush()
}
func (a *API) events(w http.ResponseWriter, r *http.Request) {
	d, e := a.Store.Deployment(r.Context(), chi.URLParam(r, "id"))
	if e != nil {
		a.err(w, e)
		return
	}
	resource, e := a.Store.Resource(r.Context(), d.AppID)
	if e != nil || !a.streamAccess(r, resource, false) {
		fail(w, 403, "Access denied")
		return
	}
	if !sse(w) {
		return
	}
	after := queryInt(r, "after")
	if v, e := strconv.ParseInt(r.Header.Get("Last-Event-ID"), 10, 64); e == nil && v > after {
		after = v
	}
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		events, e := a.Store.Events(r.Context(), d.ID, after)
		if e != nil {
			return
		}
		for _, ev := range events {
			sendEvent(w, "log", ev.ID, ev)
			after = ev.ID
		}
		current, e := a.Store.Deployment(r.Context(), d.ID)
		if e != nil {
			return
		}
		finished := current.State == "healthy" || current.State == "failed" || current.State == "recovery_failed"
		// Drain retained batches before announcing completion. Clients close the
		// EventSource when they receive the final status.
		if finished && len(events) == 500 {
			continue
		}
		sendEvent(w, "status", 0, current)
		if finished {
			return
		}
		select {
		case <-r.Context().Done():
			return
		case <-tick.C:
			if !a.streamAccess(r, resource, false) {
				return
			}
		}
	}
}

type logWriter struct {
	mu      sync.Mutex
	w       http.ResponseWriter
	pending string
	secrets []string
}

func (l *logWriter) Write(b []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.pending += string(b)
	for {
		index := strings.IndexByte(l.pending, '\n')
		if index < 0 {
			break
		}
		line := l.pending[:index]
		l.pending = l.pending[index+1:]
		for _, secret := range l.secrets {
			if secret != "" {
				line = strings.ReplaceAll(line, secret, "[redacted]")
			}
		}
		sendEvent(l.w, "log", 0, map[string]string{"message": line})
	}
	if len(l.pending) > 32768 {
		l.pending = ""
		sendEvent(l.w, "log", 0, map[string]string{"message": "[oversized log line omitted]"})
	}
	return len(b), nil
}
func (a *API) logs(w http.ResponseWriter, r *http.Request) {
	app, ok := a.get(w, r, false)
	if !ok {
		return
	}
	client, release, e := a.Control.Client(r.Context(), app.ID)
	if e != nil {
		a.err(w, e)
		return
	}
	defer client.Close()
	container := r.URL.Query().Get("container")
	if container == "" && len(release.Containers) > 0 {
		container = release.Containers[0]
	}
	if !control.ContainerAllowed(release, container) {
		fail(w, 403, "Container does not belong to this application")
		return
	}
	if !sse(w) {
		return
	}
	writer := &logWriter{w: w}
	for _, secret := range release.Env {
		writer.secrets = append(writer.secrets, secret)
	}
	if release.App.Source == "compose" {
		writer.secrets = append(writer.secrets, model.ComposeRedactions(release.Compose)...)
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	go func() {
		tick := time.NewTicker(10 * time.Second)
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
				if !a.streamAccess(r.WithContext(ctx), app, false) {
					cancel()
					return
				}
			}
		}
	}()
	if e = client.Run(ctx, remote.Command("docker", "logs", "--follow", "--tail", "200", container), nil, writer); e != nil && ctx.Err() == nil {
		sendEvent(w, "error", 0, map[string]string{"message": "Container log stream ended"})
	}
}

type socketWriter struct {
	mu   sync.Mutex
	conn *websocket.Conn
	ctx  context.Context
}

func (w *socketWriter) Write(b []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	e := w.conn.Write(w.ctx, websocket.MessageBinary, b)
	if e != nil {
		return 0, e
	}
	return len(b), nil
}
func (a *API) terminal(w http.ResponseWriter, r *http.Request) {
	app, ok := a.get(w, r, true)
	if !ok {
		return
	}
	csrf, _ := r.Context().Value(contextKey(2)).(string)
	if !a.allowedOrigin(r, r.Header.Get("Origin")) || !secure.Equal(csrf, r.URL.Query().Get("csrf")) {
		fail(w, 403, "Invalid terminal origin or CSRF token")
		return
	}
	client, release, e := a.Control.Client(r.Context(), app.ID)
	if e != nil {
		a.err(w, e)
		return
	}
	defer client.Close()
	container := r.URL.Query().Get("container")
	if !control.ContainerAllowed(release, container) {
		fail(w, 403, "Container does not belong to this application")
		return
	}
	shell := r.URL.Query().Get("shell")
	if shell == "" {
		shell = "sh"
	}
	if shell != "sh" && shell != "bash" {
		fail(w, 400, "Shell must be sh or bash")
		return
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	session, e := client.OpenTerminal(ctx, container, shell, 24, 80)
	if e != nil {
		a.err(w, e)
		return
	}
	defer session.Close()
	unregister, e := a.Control.RegisterTerminal(ctx, app.ID, func() { cancel(); _ = session.Close() })
	if e != nil {
		a.err(w, e)
		return
	}
	defer unregister()
	origin := a.requestOrigin(r)
	conn, e := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: []string{strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")}})
	if e != nil {
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "Terminal ended")
	conn.SetReadLimit(65536)
	writer := &socketWriter{conn: conn, ctx: ctx}
	go func() {
		_, _ = io.Copy(writer, session)
		cancel()
		_ = conn.Close(websocket.StatusNormalClosure, "Process exited")
	}()
	_ = a.Store.Audit(ctx, user(r).ID, "terminal.opened", app.ID, app.TeamID, map[string]string{"container": container})
	go func() { _ = session.Wait(); cancel(); _ = conn.Close(websocket.StatusNormalClosure, "Process exited") }()
	go func() {
		tick := time.NewTicker(10 * time.Second)
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
				if !a.streamAccess(r.WithContext(ctx), app, true) {
					cancel()
					_ = conn.Close(websocket.StatusPolicyViolation, "Access revoked")
					return
				}
			}
		}
	}()
	for {
		_, b, e := conn.Read(ctx)
		if e != nil {
			break
		}
		var message struct {
			Type string `json:"type"`
			Data string `json:"data"`
			Rows int    `json:"rows"`
			Cols int    `json:"cols"`
		}
		if json.Unmarshal(b, &message) != nil {
			continue
		}
		switch message.Type {
		case "data":
			if _, e = io.WriteString(session, message.Data); e != nil {
				return
			}
		case "resize":
			if message.Rows > 0 && message.Rows < 1000 && message.Cols > 0 && message.Cols < 1000 {
				_ = session.Resize(message.Rows, message.Cols)
			}
		}
	}
}
