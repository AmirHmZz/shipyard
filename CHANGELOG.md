# Changelog

## [0.12.0](https://github.com/AmirHmZz/shipyard/compare/v0.11.0...v0.12.0) (2026-10-30)

### Features

- Upload, replace, and remove project and application logos from their settings. PNG, JPEG, and WebP images up to 2 MiB and 16 megapixels are normalized to PNG within 256×256 pixels, displayed on cards and headings, and stored in the database with normal backup coverage. Missing or unavailable logos fall back to the existing icons.
- Reorder project cards and application cards with dedicated drag handles, touch input, or the keyboard. Project order is shared across the workspace; application order is shared within each environment. Read-only cards remain available as drop targets, and failed saves restore the previous order.
- Show Compose service names and replica numbers in the container terminal selector, with container names or shortened IDs as fallbacks. Connections continue using full container IDs; replacing the selected container disconnects the terminal and selects the first available container.

### Bug Fixes

- Reuse a Compose image built by one service in other services declaring the same image name, instead of trying to pull that image from a registry. Build the image once and pin all consumers to it; require the builder's profile to be enabled and reject ambiguous image names with multiple builders.
- Publish release notes from the matching versioned changelog section instead of GitHub-generated compare-link-only notes. Expand earlier changelog entries and remove the obsolete Release Please footer.

### Upgrade Notes

- Migration 009 adds uploaded logos and shared card-order metadata. Existing cards retain creation order until reordered; new cards append to their group. Logo and ordering changes do not change application configuration versions or trigger deployments.
- Use the normal encrypted backup and migration process before upgrading. Downgrading across migration 009 discards uploaded logos and custom ordering while preserving deployment configuration and application data.

## [0.11.0](https://github.com/AmirHmZz/shipyard/compare/v0.10.0...v0.11.0) (2026-10-29)

### Features

- Allow Git applications using Compose to keep their Compose YAML in Shipyard while checking out the selected repository, branch and build context. Inline documents are encrypted and snapshotted for deployments and previews; relative Dockerfiles and repository files remain available without overwriting repository Compose files.
- Remove domains, Shipyard-owned DNS records, service networking settings and published ports for removed or renamed Compose services after rendering, before building images. Cleanup is audited, retryable and protected against concurrent edits; rollback and recovery cannot restore deleted routes.

### Bug Fixes

- Fix application deletion immediately after saving a new name. Update the cached application from the save response, reset stale confirmation input and use the same case-sensitive, Unicode-normalized whitespace matcher for confirmation and submission.
- Preserve the reader's position in deployment, container and job logs when new output arrives or the 2,000-line buffer rotates. Scrolling up pauses following; returning to the bottom or selecting **Jump to latest** resumes it without resetting horizontal scroll.

### Upgrade Notes

- No database migration is required. Existing Git applications continue reading Compose from the repository unless inline mode is selected; direct Compose applications retain their existing behavior.
- Service renames are treated as removal plus addition: settings are not transferred to the new service name. Cleanup remains effective if a later build or deployment fails. Declared services in disabled profiles, shared or external Docker networks, persistent data and unrelated services are preserved.

## [0.10.0](https://github.com/AmirHmZz/shipyard/compare/v0.9.0...v0.10.0) (2026-10-25)

### Features

- Add administrator-only **Attach Shipyard** and **Detach Shipyard** controls for shared Docker bridges on Local host. The control plane can reach private applications, including SOCKS proxies, using their network hostnames and container ports.
- Persist attachment choices in the database and restore them at startup and every 15 seconds, including after container recreation and system updates. Show observed connection status, errors and retry controls; pending attachments can be cancelled.
- Protect Shipyard's installation and dashboard ingress networks, verify Docker host and network ownership before changing connections, and prevent removal of networks still used by the control plane.

### Upgrade Notes

- No database migration or installation Compose changes are required. Existing installations retain their current network attachments until an administrator selects a shared network.
- Control-plane attachments require a native Linux installation with Local host enabled. Attach the application's service to the same shared network in its **Networking** tab before using its network hostname in an integration.

## [0.9.0](https://github.com/AmirHmZz/shipyard/compare/v0.8.0...v0.9.0) (2026-10-25)

### Features

- Add reusable administrator-managed SOCKS5/SOCKS5H proxies with encrypted credentials and independent Direct/proxy selection for ACME, DNS providers, and notifications.
- Add an administrator-only Monitoring section for servers and applications, including active Job attempts, with CPU, memory, storage, network and disk I/O charts, container details, and up to 30 days of history.
- Add alert defaults and per-resource inherit, override, or disabled policies, selected notification destinations, persistent incidents, and durable firing/recovery deliveries. Settings → Alerts now opens Monitoring.
- Add Telegram and Bale notification integrations with explicit test deliveries, API error handling, and scheduled retries for rate limits. Saving an integration sends no notification.

### Bug Fixes

- Restrict metrics APIs and existing metric cards to administrators, preserve missing measurements as gaps, and prevent false availability/recovery alerts for idle Jobs, intentional stops, and unavailable counters.
- Preserve generated API contract fixtures during formatting and update browser fixtures for proxy-aware DNS tests and notification delivery status.

### Upgrade Notes

- Migration 008 adds monitoring policies, incidents, and counter baselines. Existing server alert defaults and webhook destinations are preserved; application alerts start disabled.
- New measurements begin collecting after upgrade, without historical backfill. Metrics and resolved incidents are retained for 30 days.
- Downgrading across migration 008 discards monitoring policies, incidents, baselines, saved proxies, messenger connections, and certificate proxy settings. Use the normal encrypted backup and migration process before changing versions.

## [0.8.0](https://github.com/AmirHmZz/shipyard/compare/v0.7.0...v0.8.0) (2026-10-23)

### Features

- Add Job applications for tasks that run to completion, using Dockerfiles, Git-backed Compose, or direct Compose. Deploy prepares an immutable release; Run now and Run again execute that release without starting unrelated Compose dependencies.
- Add optional cron schedules with explicit timezones, upcoming-occurrence previews, per-attempt timeouts, and configurable retries. Permit one active run per application, skip overlapping or missed occurrences, and retain the original release and environment across retries.
- Show run history, attempts, exit codes, replayable logs, retry countdowns, and durable cancellation. Recover interrupted connections by inspecting the same attempt container, preserve named volumes, and clean up attempt containers and networks after capturing final output.
- Add job success, failure, and timeout webhook events. Use explicitly selected release versions and publish tags only after validation, replacing Release Please automation.

### Upgrade Notes

- Migration 007 adds job settings, executions, attempts, and logs. Existing applications remain Services and are not scheduled automatically; workload type is fixed when an application is created.
- Job schedules start disabled. Jobs do not support public routes, published ports, fixed addresses, replicas, previews, or Fresh deploy. Stop and remove Job applications before downgrading across migration 007, which discards job configuration and history.

## [0.7.0](https://github.com/AmirHmZz/shipyard/compare/v0.6.0...v0.7.0) (2026-10-22)

### Features

- Add a collapsible desktop sidebar with a saved browser preference, compact icon navigation, mobile navigation controls, and the running product version.
- Add an explicit readiness policy. New applications can become ready when their containers are running; operators can enable additional Docker-health, routed-port, and HTTP checks when required.
- Show observed DNS, certificate, and routing states with actionable errors and retry controls. Add typed OpenAPI response/request contracts and shared backend/frontend fixtures to catch API drift.

### Upgrade Notes

- No database migration is added. Existing applications and retained releases keep their checked-readiness behavior when no policy is saved; rollback restores the retained release's policy. Switching off additional checks preserves their saved definitions.

## [0.6.0](https://github.com/AmirHmZz/shipyard/compare/v0.5.0...v0.6.0) (2026-10-22)

### Features

- Add reusable administrator-managed registry credentials with encrypted passwords and team grants. Automatically select matching credentials for private image pulls and Dockerfile builds, including normalized Docker Hub hostnames.
- Add durable application Stop controls that cancel queued/running deployment work, stop managed containers without deleting persistent data, and pause automatic deployments until an explicit Start, Deploy, or Rollback.
- Retain live startup output, readiness transitions, and bounded failure diagnostics in deployment history, including exit codes, restarts, out-of-memory status, health-check output, and recent container logs.
- Centralize frontend API validation, error notifications, and optimistic cache rollback, and run independent validation suites in parallel.

### Upgrade Notes

- Migration 006 adds durable stop intent and cancellation generations. Legacy per-application registry credentials are migrated into reusable integrations after the encryption key is verified; conflicting credentials require operator resolution.
- Downgrading discards stop intent and requires a compatible backup for legacy registry settings. The saved automatic-deployment preference is preserved when an application is stopped.

## [0.5.0](https://github.com/AmirHmZz/shipyard/compare/v0.4.0...v0.5.0) (2026-10-19)

### Features

- Move the dashboard to React Router framework SPA routes while preserving Go-embedded delivery, direct URL navigation, and lazy loading for editors, terminals, and charts. Organize feature routes around a typed API and form layer.
- Replace generic application-port controls with explicit service readiness checks and preview-routing settings, including private previews without public routes or DNS configuration.
- Add an application Volumes tab with ownership-aware inventory, mount details, data usage, retained volumes, and partial-server failure reporting.
- Add container-log clearing without interrupting streaming, deduplicate replayed deployment events, and preserve distinct events with identical text. Improve provider/repository labels, tabs, and configuration layout.

### Upgrade Notes

- No database migration is added. Legacy readiness and preview settings remain compatible. Container and deployment logs retain complete diagnostic output; sensitive values may appear in logs and should be handled accordingly.

## [0.4.0](https://github.com/AmirHmZz/shipyard/compare/v0.2.0...v0.4.0) (2026-10-18)

### Features

- Publish the deployment lifecycle controls prepared for 0.3.0: durable cleanup and retries for inactive deployments, and a confirmed Fresh deploy action for resetting application-owned volumes before recreating a deployment.
- Group application lifecycle actions in a Deploy dropdown, improve hierarchy breadcrumbs, tabs, loading indicators, repository branding, and dashboard spacing, and render System updates release notes as Markdown with raw HTML disabled.

### Upgrade Notes

- This is the next published release after 0.2.0; the prepared 0.3.0 release was not published. No new database migration is added.
- Fresh deploy can permanently remove application-owned volume data and requires confirmation. Bind-mounted data and external/shared volumes remain protected; control-plane backups do not contain application-volume data.

## [0.3.0] (2026-10-18)

### Features

- Prepare inactive-deployment deletion with durable cleanup, failure reporting, and retry controls. Protect active releases and resources still needed by other deployments.
- Add Fresh deploy with an explicit volume-reset confirmation and safe failure handling, a grouped Deploy action menu, richer application navigation, and Markdown release-note rendering.

### Release Notes

- This version was prepared but not published as a GitHub release. Its product changes were included in 0.4.0.

## [0.2.0](https://github.com/AmirHmZz/shipyard/compare/v0.1.0...v0.2.0) (2026-10-18)

### Features

- Add planned remote-server removal with a live ownership inventory, expiring approval, exact-name confirmation, durable cleanup, retry controls, and SSH connection repair. Preserve unrelated workloads, shared resources, and application data outside the approved removal plan.
- Test DNS-provider credentials before saving and simplify domain setup around zone selection and relative subdomains. Identify routes by their full domain rather than a separately editable name.
- Scope application environments to the selected project, simplify repository and branch selection, and show build-context-aware file labels.
- Separate readable runtime variables from encrypted secrets, with edit, delete, and conversion controls plus inheritance across teams, projects, environments, applications, and previews. Improve loading behavior and form state handling.

### Bug Fixes

- Verify each platform image manifest independently during release publication instead of depending on mixed manifest output.

### Upgrade Notes

- Migration 004 replaces custom route names with domain-based identities; migration 005 adds ordinary runtime variables while preserving encrypted secrets. Review migration impacts and take an encrypted backup before upgrading.
- Server deletion permanently removes the approved application-owned volumes. Ordinary project/application deletion continues preserving persistent volumes. Downgrading across migration 005 discards ordinary runtime variables while preserving encrypted secrets.

## 0.1.0 (2026-10-17)

### Features

- Introduce a self-hosted Docker deployment platform with a Go control plane, React/TypeScript dashboard, HAProxy routing, and native Linux installers and images for AMD64 and ARM64.
- Deploy Dockerfiles, Git-backed Compose, and dashboard-edited direct Compose on the local Docker host or remote servers over SSH. Retain immutable releases, deployment/runtime logs, exact-image rollback, metrics, and container terminals.
- Connect GitHub Apps or Gitea accounts, trigger deployments from Git changes, and create application-scoped pull-request previews.
- Manage Cloudflare and ArvanCloud DNS zones and records, Shipyard-owned application DNS records, automatic application certificates, HTTPS/gRPC routes, dedicated TCP listeners, and service networking.
- Organize teams, projects, and environments with scoped permissions, invitations, optional TOTP, encrypted credentials, application variables, and administrator-managed published ports.
- Provide encrypted control-plane backups and manual System updates with reviewed migration plans, required backups, guarded upgrades/downgrades, and recovery support. Publish digest-pinned installation assets, checksums, and a machine-readable release manifest.

### Bug Fixes

- Make Linux validation fixtures independent of checkout paths and DNS search suffixes.

### Upgrade Notes

- This is the first published release and has no preceding version-change step. Control-plane backups exclude remote application-volume data and release images; application rollback preserves volumes and does not reverse application database migrations.
