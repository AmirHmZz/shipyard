ALTER TABLE mcp_tokens ADD COLUMN owner_id text REFERENCES users(id) ON DELETE CASCADE;
UPDATE mcp_tokens SET revoked_at=now() WHERE revoked_at IS NULL;
ALTER TABLE mcp_tokens ADD CONSTRAINT mcp_token_owner_required CHECK (owner_id IS NOT NULL OR revoked_at IS NOT NULL);
CREATE INDEX mcp_tokens_owner ON mcp_tokens (owner_id);
