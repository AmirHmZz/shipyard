// Package telemetry reports control-plane errors without request credentials or payloads.
package telemetry

import (
	"context"
	"log/slog"
	"net/url"
	"os"
	"shipyard/internal/buildinfo"
	"time"

	"github.com/getsentry/sentry-go"
)

const DefaultDSN = "https://020bd92a1d1747beab0bb32e63d3c128@rustrak.microzap.ir/1"

type Config struct {
	DSN         string `json:"dsn"`
	Environment string `json:"environment"`
	Release     string `json:"release"`
}

func FromEnv() Config {
	dsn, exists := os.LookupEnv("SENTRY_DSN")
	if !exists {
		dsn = DefaultDSN
	}
	environment := os.Getenv("SENTRY_ENVIRONMENT")
	if environment == "" {
		environment = "production"
	}
	release := os.Getenv("SENTRY_RELEASE")
	if release == "" {
		release = "shipyard@" + buildinfo.Version
	}
	return Config{DSN: dsn, Environment: environment, Release: release}
}

func (c Config) ConnectOrigin() string {
	u, err := url.Parse(c.DSN)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

func (c Config) Init() error {
	if c.DSN == "" {
		return nil
	}
	return sentry.Init(sentry.ClientOptions{
		Dsn: c.DSN, Environment: c.Environment, Release: c.Release,
		AttachStacktrace: true, SendDefaultPII: false,
		BeforeSend: Scrub,
		DataCollection: &sentry.DataCollection{
			HTTPBodies:  []sentry.BodyType{},
			Cookies:     &sentry.KeyValueCollectionBehavior{Mode: sentry.CollectionOff},
			QueryParams: &sentry.KeyValueCollectionBehavior{Mode: sentry.CollectionOff},
			HTTPHeaders: &sentry.HeaderCollectionConfig{
				Request:  &sentry.KeyValueCollectionBehavior{Mode: sentry.CollectionOff},
				Response: &sentry.KeyValueCollectionBehavior{Mode: sentry.CollectionOff},
			},
		},
	})
}

// Scrub deliberately excludes request bodies, cookies, headers, queries, user
// identity and breadcrumbs; these may contain SSH keys or application secrets.
func Scrub(event *sentry.Event, _ *sentry.EventHint) *sentry.Event {
	event.User = sentry.User{}
	event.Breadcrumbs = nil
	if event.Request != nil {
		u, err := url.Parse(event.Request.URL)
		if err == nil {
			u.RawQuery = ""
			u.Fragment = ""
			u.User = nil
			event.Request.URL = u.String()
		} else {
			event.Request.URL = ""
		}
		event.Request.Headers = nil
		event.Request.Cookies = ""
		event.Request.Data = ""
		event.Request.QueryString = ""
		event.Request.Env = nil
	}
	return event
}

// ErrorHandler mirrors error-level application logs into Sentry. Attributes
// other than the error are left in the local log and never sent as event extras.
type ErrorHandler struct{ Local slog.Handler }

func (h ErrorHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.Local.Enabled(ctx, level)
}
func (h ErrorHandler) Handle(ctx context.Context, record slog.Record) error {
	if record.Level >= slog.LevelError {
		hub := sentry.GetHubFromContext(ctx)
		if hub == nil {
			hub = sentry.CurrentHub()
		}
		hub = hub.Clone()
		hub.WithScope(func(scope *sentry.Scope) {
			scope.SetTag("component", "backend")
			scope.SetLevel(sentry.LevelError)
			var cause error
			record.Attrs(func(a slog.Attr) bool {
				if a.Key == "error" {
					cause, _ = a.Value.Any().(error)
				}
				return true
			})
			if cause != nil {
				hub.CaptureException(cause)
			} else {
				hub.CaptureMessage(record.Message)
			}
		})
	}
	return h.Local.Handle(ctx, record)
}
func (h ErrorHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return ErrorHandler{Local: h.Local.WithAttrs(attrs)}
}
func (h ErrorHandler) WithGroup(name string) slog.Handler {
	return ErrorHandler{Local: h.Local.WithGroup(name)}
}

func Flush() { sentry.Flush(3 * time.Second) }
