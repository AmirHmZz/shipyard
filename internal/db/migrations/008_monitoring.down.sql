DROP TABLE monitoring_counters,monitoring_incidents,monitoring_policies;
DELETE FROM settings WHERE key IN ('monitoring-defaults','certificate-network');
DELETE FROM resources WHERE kind='proxy';
DELETE FROM resources WHERE kind='webhook' AND data->>'provider' IN ('telegram','bale');
UPDATE resources SET data=data-'proxyId' WHERE kind IN ('dns','webhook');
