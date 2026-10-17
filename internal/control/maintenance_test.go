package control

import (
	"context"
	"github.com/google/uuid"
	"shipyard/internal/model"
	"testing"
)

func TestMaintenanceDefersLateJobClaimWithoutStartingDeployment(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	id := uuid.NewString()
	if _, e := c.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES('maintenance','true') ON CONFLICT(key) DO UPDATE SET value='true'"); e != nil {
		t.Fatal(e)
	}
	if _, e := c.Store.Pool.Exec(ctx, "INSERT INTO jobs(id,kind,resource_id,state,worker,lease_until) VALUES($1,'deploy','application','running','worker',now()+interval '1 minute')", id); e != nil {
		t.Fatal(e)
	}
	c.runJob(ctx, model.Job{ID: id, Kind: "deploy", ResourceID: "application"}, "worker")
	var state string
	var unleased bool
	if e := c.Store.Pool.QueryRow(ctx, "SELECT state,worker IS NULL AND lease_until IS NULL FROM jobs WHERE id=$1", id).Scan(&state, &unleased); e != nil {
		t.Fatal(e)
	}
	if state != "queued" || !unleased {
		t.Fatal("late deployment claim was not deferred", state, unleased)
	}
}
