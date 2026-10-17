package providers

import (
	"context"
	"os"
	"shipyard/internal/model"
	"testing"
)

// These opt-in checks only read provider state. Mutations and live issuance
// remain deliberate operator actions in the dashboard.
func TestLiveDNSProviderReadAccess(t *testing.T) {
	if os.Getenv("SHIPYARD_LIVE_DNS") != "1" {
		t.Skip("set SHIPYARD_LIVE_DNS=1 with separately supplied provider credentials")
	}
	provider, token, zone := os.Getenv("SHIPYARD_TEST_DNS_PROVIDER"), os.Getenv("SHIPYARD_TEST_DNS_TOKEN"), os.Getenv("SHIPYARD_TEST_DNS_ZONE")
	if (provider != "cloudflare" && provider != "arvancloud") || token == "" || zone == "" {
		t.Fatal("provider, token, and existing zone are required")
	}
	client := NewDNS(provider, token)
	if _, err := client.Zones(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Records(context.Background(), zone); err != nil {
		t.Fatal(err)
	}
}

func TestLiveGiteaReadAccess(t *testing.T) {
	if os.Getenv("SHIPYARD_LIVE_GITEA") != "1" {
		t.Skip("set SHIPYARD_LIVE_GITEA=1 with separately supplied instance/token")
	}
	instance, token := os.Getenv("SHIPYARD_TEST_GITEA_URL"), os.Getenv("SHIPYARD_TEST_GITEA_TOKEN")
	if instance == "" || token == "" {
		t.Fatal("Gitea instance URL and token required")
	}
	client := NewGit(model.Git{Provider: "gitea", URL: instance}, map[string]string{"token": token})
	if _, err := client.Repositories(context.Background()); err != nil {
		t.Fatal(err)
	}
}
