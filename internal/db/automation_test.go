package db

import (
	"context"
	"encoding/json"
	"errors"
	"shipyard/internal/model"
	"testing"
	"time"
)

func TestAutomationDispatchCatchupVersionsAndManualFence(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	app, err := s.Save(ctx, "", model.ResourceInput{Kind: "application", Name: "scheduled", Data: json.RawMessage(`{"engine":"dockerfile"}`)})
	if err != nil {
		t.Fatal(err)
	}
	p := model.DefaultAutomationSettings()
	p.Rules = []model.AutomationRule{{ID: "start", Enabled: true, Action: "start", Cron: "0 8 * * *", Timezone: "UTC"}, {ID: "stop", Enabled: true, Action: "stop", Cron: "0 18 * * *", Timezone: "UTC"}}
	if err = s.SaveAutomation(ctx, app.ID, p); err != nil {
		t.Fatal(err)
	}
	if err = s.SaveAutomation(ctx, app.ID, p); !errors.Is(err, ErrConflict) {
		t.Fatal("stale save", err)
	}
	now := time.Date(2026, 11, 15, 20, 0, 0, 0, time.UTC)
	_, err = s.Pool.Exec(ctx, "UPDATE application_automation SET checked_at=$2 WHERE app_id=$1", app.ID, now.Add(-72*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if err = s.DispatchAutomation(ctx, app.ID, now); err != nil {
		t.Fatal(err)
	}
	var count int
	var action string
	if err = s.Pool.QueryRow(ctx, "SELECT count(*),max(payload->>'action') FROM jobs WHERE kind='application-automation'").Scan(&count, &action); err != nil || count != 1 || action != "stop" {
		t.Fatal(count, action, err)
	}
	if err = s.DispatchAutomation(ctx, app.ID, now); err != nil {
		t.Fatal(err)
	}
	if err = s.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE kind='application-automation'").Scan(&count); err != nil || count != 1 {
		t.Fatal(count, err)
	}
	_, err = s.Pool.Exec(ctx, "UPDATE application_control SET automation_generation=1,automation_manual_at=$2 WHERE app_id=$1", app.ID, now.Add(23*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if err = s.DispatchAutomation(ctx, app.ID, now.Add(24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err = s.Pool.QueryRow(ctx, "SELECT count(*) FROM jobs WHERE kind='application-automation'").Scan(&count); err != nil || count != 1 {
		t.Fatal("manual action overwritten", count, err)
	}
}
