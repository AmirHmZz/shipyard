package model

import (
	"math"
	"testing"
	"time"
)

func TestAutomationLatestActionAndTimezone(t *testing.T) {
	p := DefaultAutomationSettings()
	p.Rules = []AutomationRule{{ID: "start", Enabled: true, Action: "start", Cron: "0 8 * * 1-5", Timezone: "Asia/Tehran"}, {ID: "stop", Enabled: true, Action: "stop", Cron: "0 18 * * 1-5", Timezone: "Asia/Tehran"}}
	if err := p.Validate(); err != nil {
		t.Fatal(err)
	}
	after := time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)
	now := time.Date(2026, 11, 11, 20, 0, 0, 0, time.UTC)
	rule, at := p.LatestAction(after, now)
	if rule.Action != "stop" || !at.Equal(time.Date(2026, 11, 11, 14, 30, 0, 0, time.UTC)) {
		t.Fatal(rule, at)
	}
	p.Rules[0].Cron = p.Rules[1].Cron
	rule, _ = p.LatestAction(after, now)
	if rule.Action != "stop" {
		t.Fatal("Stop must win ties")
	}
	rule, at = p.LatestAction(now, now)
	if rule.ID != "" || !at.IsZero() {
		t.Fatal("cursor must exclude previous occurrences")
	}
}
func TestAutomationValidation(t *testing.T) {
	valid := AutomationSettings{Restarts: []RestartPolicy{{Service: "_worker", Enabled: true, IntervalSeconds: 60}}}
	if err := valid.Validate(); err != nil {
		t.Fatal(err)
	}
	for _, seconds := range []int64{0, 59, 31536001} {
		valid.Restarts[0].IntervalSeconds = seconds
		if valid.Validate() == nil {
			t.Fatal("accepted invalid interval", seconds)
		}
	}
	for _, cron := range []string{"@every 1h", "* * * * * *", "0 0 31 2 *"} {
		p := DefaultAutomationSettings()
		p.Rules = []AutomationRule{{ID: "rule", Action: "start", Cron: cron, Timezone: "UTC"}}
		if p.Validate() == nil {
			t.Fatal(cron)
		}
	}
}
func TestResourceLimitsValidation(t *testing.T) {
	for _, cpu := range []float64{math.NaN(), math.Inf(1), 0, -1, 0.00001} {
		if ValidateResourceLimits(map[string]ServiceLimits{"app": {CPUs: &cpu}}) == nil {
			t.Fatal(cpu)
		}
	}
	for _, memory := range []int64{0, -1, 6291455, 9007199254740992} {
		if ValidateResourceLimits(map[string]ServiceLimits{"app": {MemoryBytes: &memory}}) == nil {
			t.Fatal(memory)
		}
	}
	cpu := 0.5
	memory := int64(256 * 1024 * 1024)
	if err := ValidateResourceLimits(map[string]ServiceLimits{"app": {CPUs: &cpu, MemoryBytes: &memory}}); err != nil {
		t.Fatal(err)
	}
}
