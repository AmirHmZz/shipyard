package api

import (
	"context"
	"errors"
	"net/http/httptest"
	"shipyard/internal/control"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"strings"
	"testing"
)

type probeDNS struct {
	zonePickerDNS
	err error
}

func (d probeDNS) Zones(context.Context) ([]providers.ProviderZone, error) { return nil, d.err }
func TestUnsavedDNSProviderProbe(t *testing.T) {
	for _, tc := range []struct {
		name, body  string
		admin       bool
		upstream    error
		want, calls int
	}{
		{"viewer", `{"provider":"cloudflare","token":"secret"}`, false, nil, 403, 0},
		{"unsupported", `{"provider":"other","token":"secret"}`, true, nil, 400, 0},
		{"empty token", `{"provider":"cloudflare","token":" "}`, true, nil, 400, 0},
		{"malformed", `{`, true, nil, 400, 0},
		{"cloudflare", `{"provider":"cloudflare","token":"secret"}`, true, nil, 200, 1},
		{"arvancloud", `{"provider":"arvancloud","token":"secret"}`, true, nil, 200, 1},
		{"provider failure", `{"provider":"cloudflare","token":"secret"}`, true, errors.New("upstream leaked secret"), 502, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			a := &API{Control: &control.Controller{DNSFactory: func(provider, token string) providers.DNSProvider {
				calls++
				if token != "secret" {
					t.Fatal("wrong token")
				}
				return probeDNS{err: tc.upstream}
			}}}
			req := httptest.NewRequest("POST", "/dns/test", strings.NewReader(tc.body))
			req = req.WithContext(context.WithValue(req.Context(), userKey, model.User{Admin: tc.admin}))
			res := httptest.NewRecorder()
			a.testDNSProvider(res, req)
			if res.Code != tc.want || calls != tc.calls {
				t.Fatalf("status=%d calls=%d body=%s", res.Code, calls, res.Body)
			}
			if strings.Contains(res.Body.String(), "secret") {
				t.Fatal("token leaked")
			}
		})
	}
}
