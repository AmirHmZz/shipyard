CREATE TABLE application_automation (
 app_id text PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
 version bigint NOT NULL DEFAULT 1,
 policy jsonb NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(),
 action_id text NOT NULL DEFAULT '',
 action_result text NOT NULL DEFAULT '',
 last_action text NOT NULL DEFAULT '',
 last_at timestamptz,
 last_result text NOT NULL DEFAULT '',
 last_error text NOT NULL DEFAULT '',
 restart_status jsonb NOT NULL DEFAULT '[]'
);
ALTER TABLE application_control ADD COLUMN automation_generation bigint NOT NULL DEFAULT 0;
ALTER TABLE application_control ADD COLUMN automation_manual_at timestamptz NOT NULL DEFAULT 'epoch';
