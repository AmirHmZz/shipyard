CREATE TABLE job_settings (
 app_id text PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
 version bigint NOT NULL DEFAULT 1,
 enabled boolean NOT NULL DEFAULT false,
 cron text NOT NULL DEFAULT '', timezone text NOT NULL DEFAULT 'UTC',
 timeout_seconds integer NOT NULL DEFAULT 1800 CHECK(timeout_seconds BETWEEN 60 AND 86400),
 retries integer NOT NULL DEFAULT 0 CHECK(retries BETWEEN 0 AND 5),
 retry_delay_seconds integer NOT NULL DEFAULT 60 CHECK(retry_delay_seconds BETWEEN 1 AND 3600),
 next_due timestamptz, checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE job_runs (
 id text PRIMARY KEY, app_id text NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 release_id text NOT NULL, state text NOT NULL CHECK(state IN ('queued','running','retry_wait','cancelling','succeeded','failed','timed_out','cancelled','skipped')),
 trigger text NOT NULL, actor text NOT NULL DEFAULT '', dedupe text UNIQUE,
 policy jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 retry_at timestamptz, error text NOT NULL DEFAULT '', cleanup_pending boolean NOT NULL DEFAULT false,
 notified boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX job_runs_active ON job_runs(app_id) WHERE state IN ('queued','running','retry_wait','cancelling') OR cleanup_pending;
CREATE INDEX job_runs_history ON job_runs(app_id,created_at DESC,id DESC);
CREATE TABLE job_attempts (
 run_id text NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE, number integer NOT NULL,
 container text NOT NULL UNIQUE, state text NOT NULL DEFAULT 'creating',
 started_at timestamptz, deadline timestamptz, stop_deadline timestamptz, finished_at timestamptz, exit_code integer,
 log_bytes integer NOT NULL DEFAULT 0, log_lines integer NOT NULL DEFAULT 0,
 logs_complete boolean NOT NULL DEFAULT false, cleaned boolean NOT NULL DEFAULT false,
 PRIMARY KEY(run_id,number)
);
CREATE TABLE job_run_events (
 id bigserial PRIMARY KEY, run_id text NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE,
 attempt integer NOT NULL DEFAULT 0, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_run_events_cursor ON job_run_events(run_id,id);
