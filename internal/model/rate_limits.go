package model

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

type RateLimit struct {
	Path          string `json:"path"`
	Match         string `json:"match"`
	Requests      int    `json:"requests"`
	WindowSeconds int    `json:"windowSeconds"`
}

var rateLimitPath = regexp.MustCompile(`^/[A-Za-z0-9/._~-]*$`)

func (r Route) ValidateRateLimits() error {
	if len(r.RateLimits) == 0 {
		return nil
	}
	if r.Protocol != "https" {
		return errors.New("rate limits require an HTTPS route")
	}
	if len(r.RateLimits) > 16 {
		return errors.New("an HTTPS route supports at most 16 rate limits")
	}
	seen := map[[2]string]bool{}
	for i, rule := range r.RateLimits {
		if rule.Match != "exact" && rule.Match != "subtree" {
			return fmt.Errorf("rate limit %d requires exact or subtree matching", i+1)
		}
		if len(rule.Path) > 256 || !rateLimitPath.MatchString(rule.Path) ||
			strings.Contains(rule.Path, "//") ||
			(rule.Match == "subtree" && rule.Path != "/" && strings.HasSuffix(rule.Path, "/")) {
			return fmt.Errorf("rate limit %d has an invalid path", i+1)
		}
		for segment := range strings.SplitSeq(rule.Path, "/") {
			if segment == "." || segment == ".." {
				return fmt.Errorf("rate limit %d has an invalid path", i+1)
			}
		}
		if rule.Requests < 1 || rule.Requests > 1_000_000 || rule.WindowSeconds < 1 || rule.WindowSeconds > 3600 {
			return fmt.Errorf("rate limit %d requires 1–1,000,000 requests and a window of 1–3,600 seconds", i+1)
		}
		key := [2]string{rule.Match, rule.Path}
		if seen[key] {
			return fmt.Errorf("rate limit %d duplicates a path and match type", i+1)
		}
		seen[key] = true
	}
	return nil
}
