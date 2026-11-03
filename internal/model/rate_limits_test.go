package model

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRouteRateLimits(t *testing.T) {
	valid := RateLimit{Path: "/login", Match: "exact", Requests: 60, WindowSeconds: 60}
	for _, tc := range []struct {
		name     string
		protocol string
		rules    []RateLimit
		ok       bool
	}{
		{"legacy", "https", nil, true},
		{"exact and subtree", "https", []RateLimit{valid, {"/login", "subtree", 1, 3600}}, true},
		{"root", "https", []RateLimit{{"/", "subtree", 1_000_000, 1}}, true},
		{"exact trailing slash", "https", []RateLimit{{"/a/", "exact", 1, 1}}, true},
		{"duplicate", "https", []RateLimit{valid, valid}, false},
		{"non-http", "tcp", []RateLimit{valid}, false},
		{"grpc", "grpc", []RateLimit{valid}, false},
		{"too many", "https", make([]RateLimit, 17), false},
		{"unknown match", "https", []RateLimit{{"/api", "regex", 1, 1}}, false},
		{"trailing slash", "https", []RateLimit{{"/api/", "subtree", 1, 1}}, false},
		{"repeat slash", "https", []RateLimit{{"/api//foo", "exact", 1, 1}}, false},
		{"dot segment", "https", []RateLimit{{"/api/../foo", "exact", 1, 1}}, false},
		{"query", "https", []RateLimit{{"/login?q=1", "exact", 1, 1}}, false},
		{"encoded", "https", []RateLimit{{"/%61pi", "exact", 1, 1}}, false},
		{"config injection", "https", []RateLimit{{"/api\nbackend evil", "exact", 1, 1}}, false},
		{"long", "https", []RateLimit{{"/" + strings.Repeat("a", 256), "exact", 1, 1}}, false},
		{"too many requests", "https", []RateLimit{{"/api", "exact", 1_000_001, 1}}, false},
		{"zero requests", "https", []RateLimit{{"/api", "exact", 0, 1}}, false},
		{"long window", "https", []RateLimit{{"/api", "exact", 1, 3601}}, false},
		{"zero window", "https", []RateLimit{{"/api", "exact", 1, 0}}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			raw, err := json.Marshal(Route{
				Protocol: tc.protocol, Domain: "app.example.com", TLS: "terminate",
				TargetPort: 8080, ListenPort: 9443, ZoneID: "zone", RateLimits: tc.rules,
			})
			if err != nil {
				t.Fatal(err)
			}
			err = Validate(ResourceInput{Kind: "route", Data: raw})
			if (err == nil) != tc.ok {
				t.Fatalf("unexpected validation result: %v", err)
			}
		})
	}
}
