package telemetry

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
)

type memoryTransport struct{ events []*sentry.Event }

func (m *memoryTransport) Configure(sentry.ClientOptions)        {}
func (m *memoryTransport) SendEvent(e *sentry.Event)             { m.events = append(m.events, e) }
func (m *memoryTransport) Flush(time.Duration) bool              { return true }
func (m *memoryTransport) FlushWithContext(context.Context) bool { return true }
func (m *memoryTransport) Close()                                {}

func TestConfigurationAndDisable(t *testing.T) {
	t.Setenv("SENTRY_DSN", "")
	if FromEnv().DSN != "" {
		t.Fatal("explicit empty DSN must disable reporting")
	}
	t.Setenv("SENTRY_DSN", DefaultDSN)
	c := FromEnv()
	if c.ConnectOrigin() != "https://rustrak.microzap.ir" || c.Environment != "production" {
		t.Fatal(c)
	}
	if (Config{DSN: "javascript:alert(1)"}).ConnectOrigin() != "" {
		t.Fatal("unsafe CSP origin")
	}
}

func TestLogAndPanicCaptureWithoutRequestSecrets(t *testing.T) {
	transport := &memoryTransport{}
	client, err := sentry.NewClient(sentry.ClientOptions{Dsn: DefaultDSN, Transport: transport, BeforeSend: Scrub, AttachStacktrace: true})
	if err != nil {
		t.Fatal(err)
	}
	hub := sentry.NewHub(client, sentry.NewScope())
	hub.Scope().SetUser(sentry.User{Email: "private@example.test"})
	hub.AddBreadcrumb(&sentry.Breadcrumb{Message: "secret-console-output"}, nil)
	handler := sentryhttp.New(sentryhttp.Options{}).Handle(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logger := slog.New(ErrorHandler{Local: slog.NewTextHandler(io.Discard, nil)})
		logger.InfoContext(r.Context(), "not an event")
		logger.ErrorContext(r.Context(), "operation failed", "error", errors.New("synthetic failure"), "token", "private-token")
		panic("synthetic panic")
	}))
	req := httptest.NewRequest("POST", "https://shipyard.test/operation?token=private-token", strings.NewReader("private-body"))
	req.Header.Set("Authorization", "Bearer private-token")
	req.Header.Set("Cookie", "session=private-cookie")
	req = req.WithContext(sentry.SetHubOnContext(req.Context(), hub))
	handler.ServeHTTP(httptest.NewRecorder(), req)
	if len(transport.events) != 2 {
		t.Fatalf("got %d events", len(transport.events))
	}
	for _, event := range transport.events {
		if (len(event.Exception) == 0 && event.Message == "") || event.User.Email != "" || len(event.Breadcrumbs) != 0 {
			t.Fatal("missing error or leaked context", event)
		}
		r := event.Request
		if r == nil || strings.Contains(r.URL, "?") || r.Data != "" || r.Cookies != "" || len(r.Headers) != 0 || r.QueryString != "" {
			t.Fatal("request credentials leaked", r)
		}
	}
}
