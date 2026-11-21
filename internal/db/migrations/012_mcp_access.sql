CREATE TABLE mcp_tokens (
 id text PRIMARY KEY,
 name text NOT NULL,
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE TABLE mcp_token_projects (
 token_id text NOT NULL REFERENCES mcp_tokens(id) ON DELETE CASCADE,
 project_id text NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 PRIMARY KEY (token_id, project_id)
);
CREATE INDEX mcp_token_projects_project ON mcp_token_projects (project_id);
CREATE INDEX events_created ON events (created_at, id);
CREATE INDEX job_run_events_created ON job_run_events (created_at, id);
