CREATE TABLE monitoring_policies (
 resource_id text PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
 data jsonb NOT NULL
);
CREATE TABLE monitoring_incidents (
 id text PRIMARY KEY,
 resource_id text NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 kind text NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','firing','resolved')),
 since timestamptz NOT NULL,
 fired_at timestamptz,
 resolved_at timestamptz,
 destinations jsonb NOT NULL DEFAULT '[]',
 data jsonb NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX monitoring_incident_active ON monitoring_incidents(resource_id,kind) WHERE state<>'resolved';
CREATE INDEX monitoring_incidents_history ON monitoring_incidents(resource_id,since DESC);
CREATE TABLE monitoring_counters (
 resource_id text PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
 data jsonb NOT NULL
);
INSERT INTO settings(key,value)
SELECT 'monitoring-defaults',jsonb_build_object(
 'server',COALESCE((SELECT value FROM settings WHERE key='alert-policy'),'{"cpu":90,"memory":90,"disk":90,"sustainedSeconds":300,"offlineSeconds":60}'::jsonb) || jsonb_build_object('enabled',true,'destinations',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM resources WHERE kind='webhook'),'[]'::jsonb)),
 'application',jsonb_build_object('enabled',false,'cpu',90,'memory',90,'disk',90,'sustainedSeconds',300,'offlineSeconds',60,'destinations','[]'::jsonb)
);
INSERT INTO settings(key,value) VALUES('certificate-network','{"proxyId":""}');
