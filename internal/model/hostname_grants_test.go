package model

import "testing"

func TestHostnamePatternCovers(t *testing.T) {
	for _, tc := range []struct {
		pattern, request string
		want             bool
	}{
		{"api.example.com", "api.example.com", true},
		{"api.example.com", "sub.api.example.com", false},
		{"api.example.com", "*.example.com", false},
		{"*.apps.example.com", "api.apps.example.com", true},
		{"*.apps.example.com", "deep.api.apps.example.com", true},
		{"*.apps.example.com", "apps.example.com", false},
		{"*.apps.example.com", "api.otherapps.example.com", false},
		{"*.apps.example.com", "api.apps.example.com.evil.test", false},
		{"*.apps.example.com", "*.apps.example.com", true},
		{"*.apps.example.com", "*.nested.apps.example.com", true},
		{"*.apps.example.com", "*.example.com", false},
	} {
		if got := HostnamePatternCovers(tc.pattern, tc.request); got != tc.want {
			t.Errorf("%s covers %s = %v, want %v", tc.pattern, tc.request, got, tc.want)
		}
	}
}
