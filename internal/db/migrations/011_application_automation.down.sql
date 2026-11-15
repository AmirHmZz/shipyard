DELETE FROM jobs WHERE kind IN ('application-automation','application-restart');
DROP TABLE application_automation;
ALTER TABLE application_control DROP COLUMN automation_generation;
ALTER TABLE application_control DROP COLUMN automation_manual_at;
UPDATE resources SET data=data-'resourceLimits' WHERE kind='application';
