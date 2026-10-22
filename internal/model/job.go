package model

import (
	"errors"
	"github.com/robfig/cron/v3"
	"strings"
	"time"
	_ "time/tzdata"
)

func (a App) IsJob() bool { return a.Workload == "job" }
func (a App) WorkloadKind() string {
	if a.IsJob() {
		return "job"
	}
	return "service"
}
func (a App) JobTarget() string {
	if a.Engine == "dockerfile" {
		return "app"
	}
	return a.JobService
}
func ValidateJobApplication(a App) error {
	if a.Workload != "" && a.Workload != "service" && a.Workload != "job" {
		return errors.New("workload must be service or job")
	}
	if !a.IsJob() {
		return nil
	}
	if a.Engine == "compose" && a.JobService == "" {
		return errors.New("Compose Jobs require a target service")
	}
	if a.Previews || a.PreviewOf != "" || len(a.PublishedPorts) > 0 || len(a.ReadinessChecks) > 0 {
		return errors.New("Jobs do not support previews, published ports or readiness checks")
	}
	for _, n := range a.Networking {
		for _, c := range n.Connections {
			if c.IPv4 != "" || c.IPv6 != "" {
				return errors.New("Jobs require dynamic network addresses")
			}
		}
	}
	return nil
}

type JobSettings struct {
	Version           int64       `json:"version"`
	Enabled           bool        `json:"enabled"`
	Cron              string      `json:"cron"`
	Timezone          string      `json:"timezone"`
	TimeoutSeconds    int         `json:"timeoutSeconds"`
	Retries           int         `json:"retries"`
	RetryDelaySeconds int         `json:"retryDelaySeconds"`
	NextDue           *time.Time  `json:"nextDue"`
	Upcoming          []time.Time `json:"upcoming"`
}

func DefaultJobSettings() JobSettings {
	return JobSettings{Version: 0, Timezone: "UTC", TimeoutSeconds: 1800, RetryDelaySeconds: 60, Upcoming: []time.Time{}}
}
func (s JobSettings) Schedule() (cron.Schedule, error) {
	if s.Timezone == "" || s.Timezone == "Local" {
		return nil, errors.New("explicit IANA timezone required")
	}
	if len(strings.Fields(s.Cron)) != 5 {
		return nil, errors.New("schedule must contain exactly five cron fields; configure timezone separately")
	}
	loc, err := time.LoadLocation(s.Timezone)
	if err != nil {
		return nil, errors.New("valid IANA timezone required")
	}
	p := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	schedule, err := p.Parse(s.Cron)
	if err != nil {
		return nil, errors.New("schedule must be a valid five-field cron expression")
	}
	spec := schedule.(*cron.SpecSchedule)
	spec.Location = loc
	if spec.Next(time.Now()).IsZero() {
		return nil, errors.New("schedule has no future occurrence")
	}
	return spec, nil
}
func (s JobSettings) Validate() error {
	if s.Timezone == "" || s.Timezone == "Local" {
		return errors.New("explicit IANA timezone required")
	}
	if s.TimeoutSeconds < 60 || s.TimeoutSeconds > 86400 || s.Retries < 0 || s.Retries > 5 || s.RetryDelaySeconds < 1 || s.RetryDelaySeconds > 3600 {
		return errors.New("timeout must be 60–86400 seconds, retries 0–5, and retry delay 1–3600 seconds")
	}
	if _, err := time.LoadLocation(s.Timezone); err != nil {
		return errors.New("valid IANA timezone required")
	}
	if s.Enabled || s.Cron != "" {
		_, err := s.Schedule()
		return err
	}
	return nil
}
func (s *JobSettings) Preview(now time.Time) {
	s.Upcoming = []time.Time{}
	schedule, err := s.Schedule()
	if err != nil {
		return
	}
	for range 5 {
		now = schedule.Next(now)
		s.Upcoming = append(s.Upcoming, now)
	}
}

type JobRun struct {
	ID             string       `json:"id"`
	AppID          string       `json:"applicationId"`
	ReleaseID      string       `json:"releaseId"`
	State          string       `json:"state"`
	Trigger        string       `json:"trigger"`
	Actor          string       `json:"actor"`
	Policy         JobSettings  `json:"policy"`
	CreatedAt      time.Time    `json:"createdAt"`
	FinishedAt     *time.Time   `json:"finishedAt"`
	RetryAt        *time.Time   `json:"retryAt"`
	Error          string       `json:"error"`
	CleanupPending bool         `json:"cleanupPending"`
	Attempts       []JobAttempt `json:"attempts"`
}

func (r JobRun) Active() bool {
	return r.State == "queued" || r.State == "running" || r.State == "retry_wait" || r.State == "cancelling"
}

type JobAttempt struct {
	Number       int        `json:"number"`
	Container    string     `json:"container"`
	State        string     `json:"state"`
	StartedAt    *time.Time `json:"startedAt"`
	Deadline     *time.Time `json:"deadline"`
	FinishedAt   *time.Time `json:"finishedAt"`
	ExitCode     *int       `json:"exitCode"`
	LogBytes     int        `json:"logBytes"`
	LogLines     int        `json:"logLines"`
	LogsComplete bool       `json:"logsComplete"`
	Cleaned      bool       `json:"cleaned"`
}
type JobRunEvent struct {
	ID        int64     `json:"id"`
	RunID     string    `json:"runId"`
	Attempt   int       `json:"attempt"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"createdAt"`
}
