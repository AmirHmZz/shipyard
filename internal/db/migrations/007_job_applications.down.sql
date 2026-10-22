DROP TABLE job_run_events, job_attempts, job_runs, job_settings;
UPDATE resources SET data=data-'workload'-'jobService' WHERE kind='application';
