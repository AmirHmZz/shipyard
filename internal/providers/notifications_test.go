package providers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"unicode/utf16"

	"shipyard/internal/model"
)

type notificationTransport func(*http.Request) (*http.Response, error)

func (f notificationTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestMessengerPayloadErrorsAndRateLimits(t *testing.T) {
	for _, provider := range []string{"telegram", "bale"} {
		for _, tc := range []struct {
			body          string
			code          int
			fail, limited bool
		}{{`{"ok":true,"result":{"message_id":1}}`, 200, false, false}, {`{"ok":false,"error_code":400,"description":"bad secret-token"}`, 200, true, false}, {`{"ok":false,"error_code":429,"parameters":{"retry_after":75}}`, 429, true, true}, {`bad response`, 200, true, false}} {
			client := &http.Client{Transport: notificationTransport(func(r *http.Request) (*http.Response, error) {
				if !strings.HasSuffix(r.URL.Path, "/botsecret-token/sendMessage") {
					t.Fatal("wrong endpoint", r.URL.Path)
				}
				var body map[string]string
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Fatal(err)
				}
				if body["chat_id"] != "@alerts" || !strings.Contains(body["text"], "سلام") {
					t.Fatal(body)
				}
				if provider == "bale" && strings.ContainsAny(body["text"], "*_[]`") {
					t.Fatal("Bale formatting injection", body)
				}
				return &http.Response{StatusCode: tc.code, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(tc.body))}, nil
			})}
			err := SendNotification(context.Background(), client, model.Webhook{Provider: provider, ChatID: "@alerts"}, map[string]string{"token": "secret-token"}, map[string]any{"event": "resource.high", "resourceId": "*[سلام]_", "at": "now"})
			if (err != nil) != tc.fail {
				t.Fatal(err)
			}
			var limited *RetryAfterError
			if errors.As(err, &limited) != tc.limited {
				t.Fatal(err)
			}
			if limited != nil && limited.Delay.Seconds() != 75 {
				t.Fatal(limited)
			}
			if err != nil && strings.Contains(err.Error(), "secret-token") {
				t.Fatal("token exposed", err)
			}
		}
	}
}
func TestNotificationUnicodeLength(t *testing.T) {
	text := NotificationText("bale", map[string]any{"event": strings.Repeat("😀سلام", 2000)})
	if len(utf16.Encode([]rune(text))) > 4096 {
		t.Fatal("message too long")
	}
}
