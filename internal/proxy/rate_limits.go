package proxy

import (
	"cmp"
	"fmt"
	"slices"
	"strings"
)

func renderRateLimitActions(cfg *strings.Builder, b Binding) {
	order := make([]int, len(b.Route.RateLimits))
	for i := range order {
		order[i] = i
	}
	slices.SortFunc(order, func(i, j int) int {
		left, right := b.Route.RateLimits[i], b.Route.RateLimits[j]
		if left.Match != right.Match {
			if left.Match == "exact" {
				return -1
			}
			return 1
		}
		return cmp.Compare(len(right.Path), len(left.Path))
	})
	// A transaction selects one table, even when multiple path ACLs match.
	for _, i := range order {
		rule := b.Route.RateLimits[i]
		acl := fmt.Sprintf("rate_path_%d", i)
		if rule.Match == "exact" || rule.Path != "/" {
			fmt.Fprintf(cfg, "  acl %s path -m str %s\n", acl, rule.Path)
		}
		if rule.Match == "subtree" {
			prefix := strings.TrimSuffix(rule.Path, "/") + "/"
			fmt.Fprintf(cfg, "  acl %s path -m beg %s\n", acl, prefix)
		}
		fmt.Fprintf(cfg, "  http-request set-var(txn.shipyard_rate_rule) int(%d) if %s !{ var(txn.shipyard_rate_rule) -m found }\n", i, acl)
		condition := fmt.Sprintf("{ var(txn.shipyard_rate_rule) -m int eq %d }", i)
		fmt.Fprintf(cfg, "  http-request track-sc0 src table rate_%s_%d if %s\n", b.ID, i, condition)
		fmt.Fprintf(cfg, "  http-request return status 429 content-type text/plain string Too_Many_Requests if %s { sc_http_req_rate(0) gt %d }\n", condition, rule.Requests)
	}
}

func renderRateLimitTables(cfg *strings.Builder, b Binding) {
	for i, rule := range b.Route.RateLimits {
		fmt.Fprintf(cfg, "backend rate_%s_%d\n  mode http\n  stick-table type ipv6 size 10000 expire %ds store http_req_rate(%ds)\n\n",
			b.ID, i, 2*rule.WindowSeconds, rule.WindowSeconds)
	}
}
