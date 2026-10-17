package certs

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"shipyard/internal/db"
	"shipyard/internal/secure"
	"shipyard/internal/testdb"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func httpStore(t *testing.T) *db.Store {
	t.Helper()
	v, _ := secure.New(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	s, e := db.Open(context.Background(), testdb.URL(t), v)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(s.Pool.Close)
	return s
}
func TestHTTPChallengeIsolationExpiryAndOwnedCleanup(t *testing.T) {
	s := httpStore(t)
	ctx, cancel := context.WithCancel(context.Background())
	p := httpProvider{s, ctx}
	token := strings.Repeat("a", 32)
	if e := p.Present("panel.example.com", token, "authorized"); e != nil {
		t.Fatal(e)
	}
	if got, ok := HTTPChallenge(ctx, s, "PANEL.EXAMPLE.COM.:80", token); !ok || got != "authorized" {
		t.Fatal(got, ok)
	}
	for _, pair := range [][2]string{{"other.example.com", token}, {"panel.example.com", token + "/extra"}, {"panel.example.com", "../secret"}} {
		if _, ok := HTTPChallenge(ctx, s, pair[0], pair[1]); ok {
			t.Fatal("challenge isolation failed", pair)
		}
	}
	if e := p.CleanUp("panel.example.com", token, "someone-else"); e != nil {
		t.Fatal(e)
	}
	if _, ok := HTTPChallenge(ctx, s, "panel.example.com", token); !ok {
		t.Fatal("unowned challenge removed")
	}
	expired, _ := json.Marshal(httpValue{"authorized", time.Now().Add(-time.Minute)})
	_, e := s.Pool.Exec(ctx, "UPDATE settings SET value=$2 WHERE key=$1", challengeKey("panel.example.com", token), expired)
	if e != nil {
		t.Fatal(e)
	}
	if _, ok := HTTPChallenge(ctx, s, "panel.example.com", token); ok {
		t.Fatal("expired challenge served")
	}
	cancel()
	if e := p.CleanUp("panel.example.com", token, "authorized"); e != nil {
		t.Fatal(e)
	}
	var count int
	s.Pool.QueryRow(context.Background(), "SELECT count(*) FROM settings WHERE key LIKE 'http01:%'").Scan(&count)
	if count != 0 {
		t.Fatal(count)
	}
}

// A local RFC 8555 service exercises lego's actual HTTP-01 issuance pipeline.
func TestHTTP01IssuanceAgainstFakeACME(t *testing.T) {
	s := httpStore(t)
	ctx := context.Background()
	token := strings.Repeat("t", 32)
	key, e := rsa.GenerateKey(rand.Reader, 2048)
	if e != nil {
		t.Fatal(e)
	}
	var validated atomic.Bool
	var completed atomic.Bool
	var fail atomic.Bool
	var hang atomic.Bool
	var certificate []byte
	var base string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Replay-Nonce", secure.Token())
		w.Header().Set("Content-Type", "application/json")
		send := func(status int, v any) { w.WriteHeader(status); json.NewEncoder(w).Encode(v) }
		order := func() map[string]any {
			state := "ready"
			if completed.Load() {
				state = "valid"
			}
			return map[string]any{"status": state, "identifiers": []any{map[string]string{"type": "dns", "value": "panel.example.com"}}, "authorizations": []string{base + "/authz"}, "finalize": base + "/finalize", "certificate": base + "/cert"}
		}
		switch r.URL.Path {
		case "/directory":
			send(200, map[string]any{"newNonce": base + "/nonce", "newAccount": base + "/account", "newOrder": base + "/order"})
		case "/nonce":
			w.WriteHeader(200)
		case "/account":
			w.Header().Set("Location", base+"/account/1")
			send(201, map[string]any{"status": "valid", "orders": base + "/orders"})
		case "/order":
			w.Header().Set("Location", base+"/order/1")
			send(201, order())
		case "/order/1":
			send(200, order())
		case "/authz":
			state := "pending"
			if validated.Load() {
				state = "valid"
			}
			send(200, map[string]any{"status": state, "identifier": map[string]string{"type": "dns", "value": "panel.example.com"}, "challenges": []any{map[string]string{"type": "http-01", "url": base + "/challenge", "status": state, "token": token}}})
		case "/challenge":
			if hang.Load() {
				select {
				case <-r.Context().Done():
				case <-time.After(3 * time.Second):
				}
				return
			}
			if fail.Load() {
				send(400, map[string]string{"type": "urn:ietf:params:acme:error:connection", "detail": "port 80 unavailable"})
				return
			}
			authorization, ok := HTTPChallenge(ctx, s, "panel.example.com", token)
			if !ok || !strings.HasPrefix(authorization, token+".") {
				t.Error("active HTTP-01 challenge missing")
				send(400, map[string]string{"detail": "missing challenge"})
				return
			}
			validated.Store(true)
			send(200, map[string]string{"status": "valid", "type": "http-01", "url": base + "/challenge", "token": token})
		case "/finalize":
			var jws struct{ Payload string }
			json.NewDecoder(r.Body).Decode(&jws)
			raw, _ := base64.RawURLEncoding.DecodeString(jws.Payload)
			var body struct{ CSR string }
			json.Unmarshal(raw, &body)
			der, _ := base64.RawURLEncoding.DecodeString(body.CSR)
			csr, err := x509.ParseCertificateRequest(der)
			if err != nil {
				t.Error(err)
				w.WriteHeader(400)
				return
			}
			template := &x509.Certificate{SerialNumber: big.NewInt(42), Subject: csr.Subject, DNSNames: csr.DNSNames, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(90 * 24 * time.Hour), KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
			der, err = x509.CreateCertificate(rand.Reader, template, template, csr.PublicKey, key)
			if err != nil {
				t.Error(err)
				return
			}
			certificate = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
			completed.Store(true)
			send(200, order())
		case "/cert":
			w.Header().Set("Content-Type", "application/pem-certificate-chain")
			w.Write(certificate)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	base = server.URL
	ca := filepath.Join(t.TempDir(), "ca.pem")
	if e = os.WriteFile(ca, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw}), 0600); e != nil {
		t.Fatal(e)
	}
	t.Setenv("LEGO_CA_CERTIFICATES", ca)
	issuer := &ACME{Store: s, Directory: base + "/directory", AcceptTOS: true}
	bundle, expires, e := issuer.ObtainHTTP(ctx, "panel.example.com")
	if e != nil {
		t.Fatal(e)
	}
	if !validated.Load() || expires.Before(time.Now().Add(80*24*time.Hour)) || !strings.Contains(string(bundle), "PRIVATE KEY") {
		t.Fatal("issuance result invalid")
	}
	var count int
	s.Pool.QueryRow(ctx, "SELECT count(*) FROM settings WHERE key LIKE 'http01:%'").Scan(&count)
	if count != 0 {
		t.Fatal("challenge retained after issuance")
	}
	validated.Store(false)
	completed.Store(false)
	fail.Store(true)
	if _, _, e = issuer.ObtainHTTP(ctx, "panel.example.com"); e == nil {
		t.Fatal("failed validation accepted")
	}
	s.Pool.QueryRow(ctx, "SELECT count(*) FROM settings WHERE key LIKE 'http01:%'").Scan(&count)
	if count != 0 {
		t.Fatal("challenge retained after failure")
	}
	validated.Store(false)
	completed.Store(false)
	fail.Store(false)
	hang.Store(true)
	cancelCtx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	started := time.Now()
	if _, _, e = issuer.ObtainHTTP(cancelCtx, "panel.example.com"); e == nil {
		t.Fatal("cancelled issuance succeeded")
	}
	if time.Since(started) > 3*time.Second {
		t.Fatal("issuance ignored cancellation")
	}
	s.Pool.QueryRow(ctx, "SELECT count(*) FROM settings WHERE key LIKE 'http01:%'").Scan(&count)
	if count != 0 {
		t.Fatal("cancelled challenge retained")
	}
}
