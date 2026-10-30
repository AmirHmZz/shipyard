package control

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"shipyard/internal/deploy"
	"shipyard/internal/model"
)

type ContainerDetail struct {
	ID      string `json:"id"`
	Service string `json:"service"`
	Replica int    `json:"replica"`
	Name    string `json:"name"`
}

func releaseContainerDetails(ids []string, inspected []deletionContainer) []ContainerDetail {
	byID := map[string]deletionContainer{}
	for _, item := range inspected {
		byID[item.ID] = item
	}
	out := make([]ContainerDetail, 0, len(ids))
	for _, id := range ids {
		item := byID[id]
		replica, _ := strconv.Atoi(item.Config.Labels["com.docker.compose.container-number"])
		out = append(out, ContainerDetail{ID: id, Service: item.Config.Labels["com.docker.compose.service"], Replica: replica, Name: strings.TrimPrefix(item.Name, "/")})
	}
	return out
}

func (c *Controller) containerDetails(ctx context.Context, release model.Release) []ContainerDetail {
	fallback := releaseContainerDetails(release.Containers, nil)
	if len(release.Containers) == 0 {
		return fallback
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	node, _, err := c.connect(ctx, release.ServerID)
	if err != nil {
		return fallback
	}
	defer node.Close()
	args := append([]string{"docker", "container", "inspect"}, release.Containers...)
	raw, err := deploy.Output(ctx, node, args...)
	if err != nil {
		return fallback
	}
	var inspected []deletionContainer
	if json.Unmarshal([]byte(raw), &inspected) != nil {
		return fallback
	}
	return releaseContainerDetails(release.Containers, inspected)
}
