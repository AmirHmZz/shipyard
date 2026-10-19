package remote

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
)

// The same transport reaches the daemon socket on SSH and native hosts. No
// helper container, mount, or command-line table parsing is needed.
func VolumeUsage(ctx context.Context, node Node) (map[string]int64, error) {
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return node.DialContext(ctx, "unix", "/var/run/docker.sock")
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport}
	req, err := http.NewRequestWithContext(ctx, "GET", "http://docker/v1.44/system/df?type=volume", nil)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("volume usage HTTP %d", response.StatusCode)
	}
	var data struct {
		Volumes []struct {
			Name      string
			UsageData *struct{ Size int64 }
		}
	}
	if err = json.NewDecoder(io.LimitReader(response.Body, 16<<20)).Decode(&data); err != nil {
		return nil, err
	}
	usage := map[string]int64{}
	for _, v := range data.Volumes {
		if v.UsageData != nil && v.UsageData.Size >= 0 {
			usage[v.Name] = v.UsageData.Size
		}
	}
	return usage, nil
}
