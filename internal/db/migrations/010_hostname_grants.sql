ALTER TABLE resource_grants ADD COLUMN hostname_patterns text[] NOT NULL DEFAULT '{}';
