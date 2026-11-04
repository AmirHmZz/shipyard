package model

import "strings"

// HostnameWithinZone checks canonical names, including wildcard names.
func HostnameWithinZone(hostname, zone string) bool {
	return hostname == zone || strings.HasSuffix(hostname, "."+zone)
}

// HostnamePatternCovers checks whether a canonical grant covers an entire
// canonical request, which can itself be a wildcard route or preview.
func HostnamePatternCovers(pattern, requested string) bool {
	if pattern == requested {
		return true
	}
	suffix, wildcard := strings.CutPrefix(pattern, "*.")
	return wildcard && strings.HasSuffix(requested, "."+suffix)
}

func (a App) UsesPublicPreviewDomain() bool {
	return a.Previews && (a.PreviewRouting == nil || a.PreviewRouting.Mode != "private")
}
