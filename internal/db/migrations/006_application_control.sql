CREATE TABLE application_control (
  app_id text PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  desired_state text NOT NULL DEFAULT 'running' CHECK (desired_state IN ('running','stopped')),
  generation bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','stopping','stopped','stop_failed')),
  error text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO application_control(app_id,desired_state,status)
SELECT app_id,CASE WHEN status='stopped' THEN 'stopped' ELSE 'running' END,
CASE WHEN status='stopped' THEN 'stopped' ELSE 'running' END FROM app_runtime;
ALTER TABLE deployments ADD COLUMN control_generation bigint NOT NULL DEFAULT 0;
