# Application automation and resource limits

Service applications have an **Automation** tab. Enable a restart interval for each service, from one minute to 365 days. Each running replica uses its Docker start time; deployments and successful restarts reset its timer. Stopped applications and stopped replicas stay stopped. Restart checks run approximately every thirty seconds. Uncertain restart outcomes require inspection and re-saving the policy before retrying.

Add any number of start/stop rules (up to 100) using five-field cron and an explicit IANA timezone. Preview the next five occurrences before saving. Rules apply immediately. After controller downtime or maintenance, only the latest missed start/stop action is applied; stop wins simultaneous rules. Manual controls override earlier occurrences until the next scheduled action. Closed previews and deleting applications are excluded. Automation is not inherited by previews.

The **Resources** tab configures CPU cores and RAM per service and container replica, including Job applications. Empty fields preserve Compose/default settings. Overrides take precedence over source CPU/RAM limits and apply on the next deployment. CPU supports fractional cores (minimum 0.001); RAM is entered in MiB/GiB (minimum 6 MiB). Reservations cannot exceed limits. Running containers are unchanged when settings are saved; rollback restores the retained release's limits. Inactive service settings can be removed.

The **Runs** tab supports deleting one or up to fifty selected finished Job runs. Confirmation permanently deletes attempt history and logs. Active runs and runs awaiting log capture or container cleanup cannot be deleted. Bulk deletion validates the complete selection before changing history. Releases and application volumes are retained.

## Upgrade

Back up the installation, inspect `shipyard migrate plan 11`, and apply `shipyard migrate apply 11` before starting the new binary. Existing applications have automation disabled and no resource-limit overrides. Downgrade removes automation settings and application overrides; retained release limits remain frozen in their Compose documents.
