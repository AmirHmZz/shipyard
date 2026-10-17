package certs

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"shipyard/internal/db"
	"strings"
	"time"
)

type httpProvider struct {
	Store   *db.Store
	Context context.Context
}
type httpValue struct {
	Authorization string    `json:"authorization"`
	Expires       time.Time `json:"expires"`
}

func challengeKey(domain, token string) string { return "http01:" + domain + ":" + token }
func validToken(token string) bool {
	if len(token) < 16 || len(token) > 256 {
		return false
	}
	for _, c := range token {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-') {
			return false
		}
	}
	return true
}
func (p *httpProvider) Present(domain, token, authorization string) error {
	if !validToken(token) {
		return errors.New("invalid ACME challenge token")
	}
	if _, e := p.Store.Pool.Exec(p.Context, "DELETE FROM settings WHERE key LIKE 'http01:%' AND (value->>'expires')::timestamptz < now()"); e != nil {
		return e
	}
	raw, _ := json.Marshal(httpValue{authorization, time.Now().UTC().Add(15 * time.Minute)})
	_, e := p.Store.Pool.Exec(p.Context, "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", challengeKey(domain, token), raw)
	return e
}
func (p *httpProvider) CleanUp(domain, token, authorization string) error {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(p.Context), 5*time.Second)
	defer cancel()
	_, e := p.Store.Pool.Exec(ctx, "DELETE FROM settings WHERE key=$1 AND value->>'authorization'=$2", challengeKey(domain, token), authorization)
	return e
}
func HTTPChallenge(ctx context.Context, s *db.Store, host, token string) (string, bool) {
	if !validToken(token) {
		return "", false
	}
	if h, _, e := net.SplitHostPort(host); e == nil {
		host = h
	}
	host = strings.TrimSuffix(strings.ToLower(host), ".")
	var raw []byte
	if s.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key=$1", challengeKey(host, token)).Scan(&raw) != nil {
		return "", false
	}
	var v httpValue
	if json.Unmarshal(raw, &v) != nil || !v.Expires.After(time.Now()) {
		return "", false
	}
	return v.Authorization, true
}
