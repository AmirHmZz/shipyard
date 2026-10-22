package model

import (
	"testing"
	"time"
)

func TestJobPolicyCronAndTimezone(t *testing.T) {
	p := DefaultJobSettings()
	p.Cron = "30 2 * * *"
	p.Timezone = "America/New_York"
	p.Enabled = true
	if err := p.Validate(); err != nil {
		t.Fatal(err)
	}
	schedule, err := p.Schedule()
	if err != nil {
		t.Fatal(err)
	}
	// 02:30 does not exist on the spring DST transition day.
	next := schedule.Next(time.Date(2026, 3, 8, 5, 0, 0, 0, time.UTC))
	if next.UTC() != time.Date(2026, 3, 9, 6, 30, 0, 0, time.UTC) {
		t.Fatal("nonexistent DST occurrence was not skipped", next)
	}
	for _, cron := range []string{"* * * * * *", "@every 1s", "0 0 31 2 *", "CRON_TZ=UTC * * * * *"} {
		p.Cron = cron
		if _, err = p.Schedule(); err == nil {
			t.Fatalf("accepted %q", cron)
		}
	}
	p = DefaultJobSettings()
	p.Timezone = "invalid/timezone"
	if p.Validate() == nil {
		t.Fatal("invalid timezone accepted")
	}
	for _, timeout := range []int{59, 86401} {
		p = DefaultJobSettings()
		p.TimeoutSeconds = timeout
		if p.Validate() == nil {
			t.Fatal(timeout)
		}
	}
	p = DefaultJobSettings()
	p.Retries = 6
	if p.Validate() == nil {
		t.Fatal("unbounded retries")
	}
}
func TestJobWorkloadRestrictions(t *testing.T) {
	if (App{}).WorkloadKind() != "service" {
		t.Fatal("legacy service changed")
	}
	base := App{Workload: "job", Engine: "compose", JobService: "task"}
	if err := ValidateJobApplication(base); err != nil {
		t.Fatal(err)
	}
	for _, a := range []App{
		{Workload: "invalid"}, {Workload: "job", Engine: "compose"},
		{Workload: "job", Previews: true}, {Workload: "job", ReadinessChecks: []HTTPReadinessCheck{{Service: "app"}}},
		{Workload: "job", PublishedPorts: map[string][]PublishedPort{"app": {}}},
		{Workload: "job", Networking: map[string]ServiceNetworking{"app": {Connections: []NetworkAttachment{{IPv4: "172.18.0.2"}}}}},
	} {
		if ValidateJobApplication(a) == nil {
			t.Fatalf("accepted %#v", a)
		}
	}
}
