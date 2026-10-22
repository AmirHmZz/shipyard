# Job applications

Choose **Job** when creating an application for a task that runs to completion. Workload type cannot be changed afterward. Existing applications remain Services, including services with `restart: "no"`.

Jobs accept Git-backed Dockerfiles, Git-backed Compose, and direct Compose. Dockerfile Jobs execute the image's entrypoint and command. Compose Jobs execute exactly the selected service; dependencies are not started or pulled. Keep databases and other persistent services in separate applications. Public routes, published ports, fixed addresses, replicas, previews, and Fresh deploy are unavailable.

**Deploy** builds/pulls and pins a prepared release without executing it. **Run now** and **Run again** execute the latest successfully deployed release with its frozen environment. A failed deployment leaves the previous release available. Rollback selects a retained release without running it. Git push deployments only prepare versions.

## Scheduling and retries

Save one optional five-field cron expression and an explicit IANA timezone. For example, `0 2 * * *` runs daily at 02:00 in the selected timezone; `*/15 * * * *` runs every fifteen minutes. Use Preview schedule to check the next five occurrences. Nonexistent daylight-saving times are skipped; repeated local times follow cron's timezone rules and represent distinct UTC occurrences.

Settings apply immediately to future runs, independently of deployment or rollback. Defaults are a disabled schedule, a 30-minute timeout per attempt, and no retries. Timeouts range from one minute to 24 hours. Up to five additional retries use a configurable fixed delay of 1–3600 seconds (default 60).

Only one run can be active per application, including retry waits and cancellation. Overlapping scheduled occurrences are recorded as skipped. Manual execution returns a busy error identifying the active run. Missed occurrences during downtime or maintenance are summarized and skipped; Shipyard never replays a backlog.

Retries retain their original release, environment, and execution policy, even if a new version is deployed. A retry repeats the task and may repeat its side effects: design jobs to tolerate repetition. Deployment success means the version was prepared; run success requires a confirmed exit code of zero.

## Recovery, logs, and storage

Every attempt has a fresh container, restart policy `no`, and a durable identity. Worker or connection recovery inspects the same container rather than rerunning it. Uncertain server state keeps the execution slot reserved until Shipyard can confirm the outcome. If a start was interrupted before Docker could confirm it, cancel the uncertain run before trying again. A missing previously started container is recorded as an unknown-outcome failure and is not automatically retried. The execution slot also remains reserved until attempt cleanup is confirmed.

Cancel stops queued/retry-wait runs immediately. Running tasks receive their configured stop signal and grace period (default ten seconds), followed by forced termination. The stop deadline survives controller restarts. Cancellation is durable, available during maintenance, and never retried. During maintenance, new starts pause while existing containers remain subject to timeout and cancellation. Backups and version changes wait for active work and cleanup.

Run details show attempts, exit codes, timestamps, retry countdowns, and replayable logs. Known secrets are redacted; each attempt retains up to 1 MiB of output with a visible truncation marker. Terminal history and logs are retained for thirty days; active runs and pending cleanup are preserved. The existing webhook integration accepts `job.succeeded`, `job.failed`, and `job.timed_out`; failure notifications occur after retries are exhausted.

Application-scoped named volumes survive attempts and releases. Anonymous volumes and attempt networks are cleaned after final logs are captured. Bind mounts and external/shared volumes retain their existing ownership protections. Releases needed by active runs or cleanup cannot be deleted.

## Upgrade

This feature adds schema 7 through Shipyard's explicit migration workflow. Back up the existing installation, inspect `shipyard migrate plan 7`, then apply `shipyard migrate apply 7` before starting the new binary. Downgrade discards job configuration and history: stop and remove Job applications first, or restore a compatible backup. Shipyard does not run existing one-shot Compose services on a schedule automatically.
