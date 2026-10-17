package proxy

import (
	"errors"
	"regexp"
	"sort"
	"strings"

	"shipyard/internal/model"
)

// RoutingMaps is generated alongside the configuration, never edited at runtime.
func RoutingMaps(bindings []Binding) (map[string][]byte, error) {
	entries := append([]Binding(nil), bindings...)
	for i := range entries {
		if entries[i].Route.Protocol == "tcp" || len(entries[i].Targets) == 0 {
			continue
		}
		domain, err := model.Domain(entries[i].Route.Domain)
		if err != nil {
			return nil, err
		}
		entries[i].Route.Domain = domain
	}
	sort.Slice(entries, func(i, j int) bool {
		if len(entries[i].Route.Domain) != len(entries[j].Route.Domain) {
			return len(entries[i].Route.Domain) > len(entries[j].Route.Domain)
		}
		return entries[i].Route.Domain < entries[j].Route.Domain
	})
	var hosts, wildcards, redirects strings.Builder
	seen := map[string]bool{}
	for _, b := range entries {
		if b.Route.Protocol == "tcp" || len(b.Targets) == 0 {
			continue
		}
		if !safeID(b.ID) {
			return nil, errors.New("invalid route ID")
		}
		domain, err := model.Domain(b.Route.Domain)
		if err != nil {
			return nil, err
		}
		if seen[domain] {
			return nil, errors.New("hostname is already assigned")
		}
		seen[domain] = true
		backend := "b_" + b.ID
		if b.Unavailable {
			backend = "unavailable"
		}
		if strings.HasPrefix(domain, "*.") {
			wildcards.WriteString("^.+\\." + regexp.QuoteMeta(strings.TrimPrefix(domain, "*.")) + "$ " + backend + "\n")
		} else {
			hosts.WriteString(domain + " " + backend + "\n")
		}
		if b.Certificate {
			redirects.WriteString("b_" + b.ID + " 1\n")
		}
	}
	return map[string][]byte{"hosts.map": []byte(hosts.String()), "wildcards.map": []byte(wildcards.String()), "redirects.map": []byte(redirects.String())}, nil
}
