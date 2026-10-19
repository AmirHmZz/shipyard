package remote

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type usageNode struct {
	Node
	address string
	t       *testing.T
}

func (n usageNode) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	if network != "unix" || address != "/var/run/docker.sock" {
		n.t.Errorf("unexpected daemon destination %s %s", network, address)
	}
	return (&net.Dialer{}).DialContext(ctx, "tcp", n.address)
}
func TestVolumeUsageDistinguishesEmptyAndUnknown(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1.44/system/df" || r.URL.Query().Get("type") != "volume" {
			t.Error(r.URL)
		}
		_, _ = w.Write([]byte(`{"Volumes":[{"Name":"empty","UsageData":{"Size":0}},{"Name":"data","UsageData":{"Size":12345}},{"Name":"unknown","UsageData":{"Size":-1}},{"Name":"unsupported"}]}`))
	}))
	defer server.Close()
	usage, err := VolumeUsage(context.Background(), usageNode{address: strings.TrimPrefix(server.URL, "http://"), t: t})
	if err != nil || len(usage) != 2 || usage["data"] != 12345 {
		t.Fatal(usage, err)
	}
	if size, ok := usage["empty"]; !ok || size != 0 {
		t.Fatal("empty volume missing", usage)
	}
	if _, ok := usage["unknown"]; ok {
		t.Fatal("unknown size became zero")
	}
}
