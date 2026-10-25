package providers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"shipyard/internal/model"
)

type RetryAfterError struct{ Delay time.Duration }

func (e *RetryAfterError) Error() string {
	return "notification rate limited; delivery scheduled for retry"
}
func (e *RetryAfterError) RetryAfter() time.Duration { return e.Delay }

func NotificationText(provider string, payload map[string]any) string {
	text := fmt.Sprintf("Shipyard: %v\nResource: %v\nTime: %v", payload["event"], payload["resourceId"], payload["at"])
	if data, ok := payload["data"]; ok {
		raw, _ := json.Marshal(data)
		text += "\n" + string(raw)
	}
	if provider == "bale" {
		text = strings.NewReplacer("*", "＊", "_", "＿", "[", "［", "]", "］", "`", "ˋ").Replace(text)
	}
	// Use a conservative UTF-16 length budget, shared by both messenger APIs.
	out := []rune{}
	n := 0
	for _, r := range text {
		size := 1
		if r > 0xffff {
			size = 2
		}
		if n+size > 4000 {
			break
		}
		out = append(out, r)
		n += size
	}
	return string(out)
}

// SendNotification accepts an injected client for isolated transport and tests.
// Bot endpoints are fixed by provider; credentials never enter durable payloads.
func SendNotification(ctx context.Context, client *http.Client, spec model.Webhook, secrets map[string]string, payload map[string]any) error {
	endpoint := spec.URL
	var body []byte
	var err error
	if spec.Messenger() {
		token := secrets["token"]
		if token == "" || strings.ContainsAny(token, "/\\?#\r\n\x00 ") {
			return errors.New("invalid messenger credentials")
		}
		host := "https://api.telegram.org"
		if spec.Provider == "bale" {
			host = "https://tapi.bale.ai"
		}
		endpoint = host + "/bot" + token + "/sendMessage"
		body, err = json.Marshal(map[string]string{"chat_id": spec.ChatID, "text": NotificationText(spec.Provider, payload)})
	} else {
		body, err = json.Marshal(payload)
	}
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return errors.New("invalid notification endpoint")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Shipyard")
	if !spec.Messenger() {
		if secret := secrets["signing_secret"]; secret != "" {
			h := hmac.New(sha256.New, []byte(secret))
			h.Write(body)
			req.Header.Set("X-Shipyard-Signature", "sha256="+hex.EncodeToString(h.Sum(nil)))
		}
		if id, ok := payload["id"].(string); ok {
			req.Header.Set("X-Shipyard-Delivery", id)
		}
	}
	res, err := client.Do(req)
	if err != nil {
		return errors.New("notification connection failed")
	}
	defer res.Body.Close()
	var result struct {
		OK          bool   `json:"ok"`
		Code        int    `json:"error_code"`
		Description string `json:"description"`
		Parameters  struct {
			RetryAfter int `json:"retry_after"`
		} `json:"parameters"`
	}
	if spec.Messenger() {
		err = json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&result)
	} else {
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<20))
	}
	delay := result.Parameters.RetryAfter
	if seconds, e := strconv.Atoi(res.Header.Get("Retry-After")); e == nil && seconds > delay {
		delay = seconds
	}
	if res.StatusCode == 429 || result.Code == 429 || delay > 0 {
		if delay < 1 {
			delay = 30
		}
		if int64(delay) > int64((time.Duration(1<<63-1))/time.Second) {
			return errors.New("notification retry delay exceeds supported duration")
		}
		return &RetryAfterError{time.Duration(delay) * time.Second}
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("notification endpoint returned HTTP %d", res.StatusCode)
	}
	if spec.Messenger() && (err != nil || !result.OK) {
		description := result.Description
		for _, secret := range secrets {
			if secret != "" {
				description = strings.ReplaceAll(description, secret, "[redacted]")
			}
		}
		description = strings.Map(func(r rune) rune {
			if r < ' ' || r == utf8.RuneError {
				return ' '
			}
			return r
		}, description)
		runes := []rune(description)
		if len(runes) > 160 {
			description = string(runes[:160])
		}
		return fmt.Errorf("messenger rejected notification (code %d): %s", result.Code, description)
	}
	return nil
}
