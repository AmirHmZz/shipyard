package api

import (
	"crypto/sha256"
	"encoding/base64"
	"io/fs"
	"regexp"
	"strings"
	"sync"

	webassets "shipyard/internal/web"
)

var inlineDashboardScript = regexp.MustCompile(`(?is)<script\b([^>]*)>(.*?)</script\s*>`)
var scriptSourceAttribute = regexp.MustCompile(`(?i)\bsrc\s*=`)

// The framework SPA build embeds a few inline bootstrap scripts in index.html.
// Hash only those exact bytes so the dashboard can hydrate under the CSP without
// allowing arbitrary inline JavaScript.
var dashboardScriptHashes = sync.OnceValue(func() string {
	assets, err := fs.Sub(webassets.Assets, "dist")
	if err != nil {
		return ""
	}
	index, err := fs.ReadFile(assets, "index.html")
	if err != nil {
		return ""
	}
	hashes := []string{}
	for _, script := range inlineDashboardScript.FindAllSubmatch(index, -1) {
		if scriptSourceAttribute.Match(script[1]) || len(script[2]) == 0 {
			continue
		}
		sum := sha256.Sum256(script[2])
		hashes = append(hashes, "'sha256-"+base64.StdEncoding.EncodeToString(sum[:])+"'")
	}
	return strings.Join(hashes, " ")
})
