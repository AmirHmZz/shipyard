ALTER TABLE mcp_token_projects ADD COLUMN permissions text[] NOT NULL DEFAULT '{}'
 CHECK (permissions <@ ARRAY['configure','lifecycle','freshDeploy','cleanup']::text[]);
