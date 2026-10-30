package control

import (
	"context"
	"testing"

	"shipyard/internal/model"
)

func TestReleaseContainerDetails(t *testing.T) {
	item := deletionContainer{ID: "owned", Name: "/my-web-2"}
	item.Config.Labels = map[string]string{"com.docker.compose.service": "web", "com.docker.compose.container-number": "2"}
	other := deletionContainer{ID: "unrelated", Name: "/private"}
	out := releaseContainerDetails([]string{"owned", "missing"}, []deletionContainer{item, other})
	if len(out) != 2 || out[0].Service != "web" || out[0].Replica != 2 || out[0].Name != "my-web-2" || out[1].ID != "missing" || out[1].Name != "" {
		t.Fatal(out)
	}
}

func TestContainerDetailsUnavailableServer(t *testing.T) {
	c, _, _, _ := deletionFixture(t)
	got := c.containerDetails(context.Background(), model.Release{ServerID: "missing", Containers: []string{"owned"}})
	if len(got) != 1 || got[0].ID != "owned" || got[0].Service != "" {
		t.Fatal(got)
	}
}
