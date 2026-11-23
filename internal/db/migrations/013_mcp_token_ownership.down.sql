DELETE FROM mcp_tokens WHERE owner_id IS NOT NULL;
ALTER TABLE mcp_tokens DROP CONSTRAINT mcp_token_owner_required, DROP COLUMN owner_id;
