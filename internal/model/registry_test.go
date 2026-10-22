package model

import "testing"

func TestRegistryHostnameAndAuthKeys(t *testing.T) {
	for input, want := range map[string]string{"ghcr.io": "ghcr.io", " GHCR.IO ": "ghcr.io", "registry.example.com:5000": "registry.example.com:5000", "localhost:5000": "localhost:5000", "index.docker.io": "docker.io", "registry-1.docker.io": "docker.io", "docker.io": "docker.io", "[::1]:5000": "[::1]:5000"} {
		got, err := RegistryHostname(input)
		if err != nil || got != want {
			t.Errorf("%q: %q %v", input, got, err)
		}
	}
	for _, input := range []string{"", "https://ghcr.io", "ghcr.io/team/app", "user@ghcr.io", "ghcr.io:0", "ghcr.io:65536", "bad host", "-bad.io", "ghcr.io\nanything"} {
		if _, err := RegistryHostname(input); err == nil {
			t.Errorf("accepted %q", input)
		}
	}
	if RegistryAuthKey("docker.io") != "https://index.docker.io/v1/" || RegistryAuthKey("ghcr.io") != "ghcr.io" {
		t.Fatal("incorrect Docker auth keys")
	}
}
