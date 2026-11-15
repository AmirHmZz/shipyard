package model

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"time"
)

var serviceName = regexp.MustCompile(`^[a-zA-Z0-9_.-]+$`)

type ServiceLimits struct {
	CPUs        *float64 `json:"cpus,omitempty"`
	MemoryBytes *int64   `json:"memoryBytes,omitempty"`
}

func ValidateResourceLimits(limits map[string]ServiceLimits) error {
	for name, limit := range limits {
		if !serviceName.MatchString(name) {
			return errors.New("invalid service name")
		}
		if limit.CPUs != nil && (math.IsNaN(*limit.CPUs) || math.IsInf(*limit.CPUs, 0) || *limit.CPUs < 0.001 || *limit.CPUs > 1e6) {
			return fmt.Errorf("%s: CPU limit must be between 0.001 and 1000000 cores", name)
		}
		if limit.MemoryBytes != nil && (*limit.MemoryBytes < 6*1024*1024 || *limit.MemoryBytes > 9007199254740991) {
			return fmt.Errorf("%s: RAM limit must be at least 6 MiB and a safe integer", name)
		}
	}
	return nil
}

type RestartPolicy struct {
	Service         string `json:"service"`
	IntervalSeconds int64  `json:"intervalSeconds"`
	Enabled         bool   `json:"enabled"`
}
type AutomationRule struct {
	ID       string `json:"id"`
	Enabled  bool   `json:"enabled"`
	Action   string `json:"action"`
	Cron     string `json:"cron"`
	Timezone string `json:"timezone"`
}

func (r AutomationRule) Schedule() (interface{ Next(time.Time) time.Time }, error) {
	return (JobSettings{Cron: r.Cron, Timezone: r.Timezone}).Schedule()
}

type AutomationSettings struct {
	Version  int64            `json:"version"`
	Restarts []RestartPolicy  `json:"restarts"`
	Rules    []AutomationRule `json:"rules"`
}

func DefaultAutomationSettings() AutomationSettings {
	return AutomationSettings{Restarts: []RestartPolicy{}, Rules: []AutomationRule{}}
}
func (s AutomationSettings) Validate() error {
	if len(s.Restarts) > 100 || len(s.Rules) > 100 {
		return errors.New("at most 100 restart policies and 100 schedule rules are allowed")
	}
	seen := map[string]bool{}
	for _, p := range s.Restarts {
		if !serviceName.MatchString(p.Service) || seen[p.Service] {
			return errors.New("restart policies require unique valid service names")
		}
		seen[p.Service] = true
		if p.IntervalSeconds < 60 || p.IntervalSeconds > int64((365*24*time.Hour)/time.Second) {
			return errors.New("restart interval must be between one minute and 365 days")
		}
	}
	seen = map[string]bool{}
	for _, r := range s.Rules {
		if !serviceName.MatchString(r.ID) || len(r.ID) > 100 || seen[r.ID] {
			return errors.New("schedule rules require unique valid IDs")
		}
		seen[r.ID] = true
		if r.Action != "start" && r.Action != "stop" {
			return errors.New("schedule action must be start or stop")
		}
		if _, err := r.Schedule(); err != nil {
			return err
		}
	}
	return nil
}

// LatestAction collapses missed occurrences across all rules; Stop wins ties.
func (s AutomationSettings) LatestAction(after, now time.Time) (AutomationRule, time.Time) {
	var chosen AutomationRule
	var latest time.Time
	for _, r := range s.Rules {
		if !r.Enabled {
			continue
		}
		schedule, err := r.Schedule()
		if err != nil {
			continue
		}
		for due := schedule.Next(after); !due.IsZero() && !due.After(now); due = schedule.Next(due) {
			if due.After(latest) || (due.Equal(latest) && r.Action == "stop") {
				chosen = r
				latest = due
			}
		}
	}
	return chosen, latest
}
