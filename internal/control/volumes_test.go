package control

import (
	"encoding/json"
	"shipyard/internal/model"
	"strings"
	"testing"
)

func TestVolumeInventoryOwnershipAndReplacements(t *testing.T) {
	r := model.Release{ID: "release", AppID: "application", ServerID: "server", App: model.App{Engine: "compose"}, Compose: `{"services":{"db":{"volumes":[{"type":"volume","source":"data","target":"/data"},{"type":"volume","target":"/anonymous"}]}},"volumes":{"data":{},"external":{"name":"external","external":true}}}`}
	var ctr deletionContainer
	ctr.ID = "container"
	ctr.Config.Labels = map[string]string{"shipyard.app": r.AppID, "shipyard.release": r.ID, "com.docker.compose.project": "sy-application", "com.docker.compose.service": "db"}
	anon := strings.Repeat("a", 64)
	_ = json.Unmarshal([]byte(`[{"Type":"volume","Name":"sy-application_data","Destination":"/data"},{"Type":"volume","Name":"`+anon+`","Destination":"/anonymous"}]`), &ctr.Mounts)
	volumes := []deletionVolume{{Name: "sy-application_data", CreatedAt: "first", Labels: map[string]string{"com.docker.compose.project": "sy-application"}}, {Name: anon, CreatedAt: "first"}, {Name: "unused", CreatedAt: "first", Labels: map[string]string{"com.docker.compose.project": "sy-application"}}, {Name: "external", Labels: map[string]string{"com.docker.compose.project": "external-owner"}}, {Name: "unrelated"}}
	got, err := ownedApplicationVolumes(r.AppID, r.ServerID, []model.Release{r}, []deletionContainer{ctr}, volumes, volumeLedger{})
	if err != nil || len(got) != 3 {
		t.Fatal(got, err)
	}
	ledger := volumeLedger{Volumes: got}
	got, err = ownedApplicationVolumes(r.AppID, r.ServerID, nil, nil, volumes, ledger)
	if err != nil || len(got) != 3 || got[0].Volume.InUse {
		t.Fatal("unused ownership was lost", got, err)
	}
	volumes[0].CreatedAt = "replacement"
	got, err = ownedApplicationVolumes(r.AppID, r.ServerID, []model.Release{r}, nil, volumes, ledger)
	for _, v := range got {
		if v.Volume.Name == volumes[0].Name {
			t.Fatal("replacement inherited ownership", got)
		}
	}
	other := ctr
	other.ID = "outsider"
	other.Config.Labels = nil
	got, err = ownedApplicationVolumes(r.AppID, r.ServerID, []model.Release{r}, []deletionContainer{ctr, other}, volumes, ledger)
	if err != nil || len(got) != 1 || got[0].Volume.Name != "unused" {
		t.Fatal("shared storage was included", got, err)
	}
}
