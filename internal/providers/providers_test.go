package providers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"shipyard/internal/model"
	"strings"
	"testing"
)

func TestWebhookSignatures(t *testing.T) {
	body := []byte(`{"event":"push"}`)
	h := hmac.New(sha256.New, []byte("secret"))
	h.Write(body)
	signature := hex.EncodeToString(h.Sum(nil))
	for _, sig := range []string{signature, "sha256=" + signature} {
		if !VerifyWebhook("secret", body, sig) {
			t.Fatal("valid signature rejected")
		}
	}
	if VerifyWebhook("", body, signature) || VerifyWebhook("other", body, signature) || VerifyWebhook("secret", append(body, ' '), signature) {
		t.Fatal("forged webhook accepted")
	}
}

func TestArvanCredentialNormalization(t *testing.T) {
	for _, token := range []string{"token", "Apikey token", " apikey  token "} {
		if ArvanAuthorization(token) != "Apikey token" {
			t.Fatal("Arvan credential normalization differs for DNS and ACME")
		}
	}
}
func TestArvanValuePreservation(t *testing.T) {
	var received map[string]any
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Apikey token" {
			t.Error("missing auth")
		}
		if r.Method == "GET" {
			_, _ = w.Write([]byte(`{"data":[{"id":"record","name":"www","type":"a","ttl":120,"cloud":false,"value":[{"ip":"192.0.2.1","weight":5},{"ip":"192.0.2.2","weight":10}],"upstream_https":"auto"}]}`))
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&received)
		_, _ = w.Write([]byte(`{"data":{"id":"record","name":"www","type":"a","ttl":300,"value":[{"ip":"192.0.2.1"}]}}`))
	}))
	defer s.Close()
	d := NewDNS("arvancloud", "token")
	d.Base = s.URL
	rows, e := d.Records(context.Background(), "example.com")
	if e != nil {
		t.Fatal(e)
	}
	if rows[0].Name != "www.example.com" {
		t.Fatal(rows)
	}
	rows[0].TTL = 300
	rows[0].Content = "192.0.2.99"
	if _, e = d.Put(context.Background(), "example.com", rows[0]); e != nil {
		t.Fatal(e)
	}
	values := received["value"].([]any)
	if len(values) != 2 || received["upstream_https"] != "auto" {
		t.Fatal("provider fields discarded", received)
	}
	if values[0].(map[string]any)["ip"] != "192.0.2.99" || values[0].(map[string]any)["weight"] != float64(5) || values[1].(map[string]any)["ip"] != "192.0.2.2" {
		t.Fatal("simple content edit ignored or other provider values changed", received)
	}
}
func TestCloudflarePaginationAndErrors(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer scoped-token" {
			t.Error("missing bearer token")
		}
		if strings.Contains(r.URL.Path, "dns_records") {
			_, _ = w.Write([]byte(`{"success":false,"result":[]}`))
			return
		}
		_, _ = w.Write([]byte(`{"success":true,"result":[{"id":"z","name":"example.com"}]}`))
	}))
	defer s.Close()
	d := NewDNS("cloudflare", "scoped-token")
	d.Base = s.URL
	zones, e := d.Zones(context.Background())
	if e != nil || len(zones) != 1 {
		t.Fatal(e)
	}
	if _, e = d.Records(context.Background(), "z"); e == nil {
		t.Fatal("provider failure ignored")
	}
	if e = ValidateRecord(model.DNSRecord{Type: "A", Name: "example.com", Content: "::1", TTL: 120}); e == nil {
		t.Fatal("IPv6 accepted in A")
	}
}
