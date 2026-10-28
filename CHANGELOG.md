# Changelog

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

- add job applications with scheduled execution ([0555101](https://github.com/AmirHmZz/shipyard/commit/0555101980d5a794c39918ca7e1e5482530d1f33))

## [0.7.0](https://github.com/AmirHmZz/shipyard/compare/v0.6.0...v0.7.0) (2026-10-22)

### Features

- align API contracts and add sidebar and readiness controls ([f56913a](https://github.com/AmirHmZz/shipyard/commit/f56913ab5e2ee5cfc37f183aeb9e913fa0b788ed))

## [0.6.0](https://github.com/AmirHmZz/shipyard/compare/v0.5.0...v0.6.0) (2026-10-22)

### Features

- add registry auth and reliable deployment controls ([40a33ee](https://github.com/AmirHmZz/shipyard/commit/40a33ee4bbb08592db041d8c456f9c0722f214f0))

## [0.5.0](https://github.com/AmirHmZz/shipyard/compare/v0.4.0...v0.5.0) (2026-10-19)

### Features

- **applications:** simplify setup and improve storage and logs ([1207d43](https://github.com/AmirHmZz/shipyard/commit/1207d4356c6b905eeecd1009de9f6f624b163026))
- **dashboard:** migrate to React Router v8 framework mode ([486c65d](https://github.com/AmirHmZz/shipyard/commit/486c65d909eee7af8ea0d9a85e1e352ab7b17de1))

## [0.4.0](https://github.com/AmirHmZz/shipyard/compare/v0.3.0...v0.4.0) (2026-10-18)

### Features

- add deployment lifecycle actions and polish dashboard UI ([8b4efa7](https://github.com/AmirHmZz/shipyard/commit/8b4efa72657069248aede664e3f769722ea873c5))
- add planned server removal and deletion safeguards ([ed80183](https://github.com/AmirHmZz/shipyard/commit/ed801833885e0c3660d11f54fa06ef62ae33f39a))
- improve application forms, routes, and variable management ([8453ec8](https://github.com/AmirHmZz/shipyard/commit/8453ec889565aba44c65404716ded513aa7b4ea8))
- introduce Shipyard deployment platform ([1725d2c](https://github.com/AmirHmZz/shipyard/commit/1725d2c44673298104fede137cb8883b5cb1977d))
- validate DNS providers and simplify route configuration ([85ff496](https://github.com/AmirHmZz/shipyard/commit/85ff496f8bcf7ad03d05c1f3e65552dfc703babd))

### Bug Fixes

- **ci:** make Linux fixtures independent of checkout and DNS search paths ([2028da9](https://github.com/AmirHmZz/shipyard/commit/2028da9589a7f6a24e7b732a3c9c5a93f8372c27))
- **ci:** verify platform manifests independently ([70d9446](https://github.com/AmirHmZz/shipyard/commit/70d9446324533f94433c1888c4368c9b2c1ccccb))

## [0.3.0](https://github.com/AmirHmZz/shipyard/compare/v0.2.0...v0.3.0) (2026-10-18)

### Features

- add deployment lifecycle actions and polish dashboard UI ([4dff298](https://github.com/AmirHmZz/shipyard/commit/4dff2984261c629c4bc497dfcb928fc8a16f5d2b))

## [0.2.0](https://github.com/AmirHmZz/shipyard/compare/v0.1.0...v0.2.0) (2026-10-18)

### Features

- add planned server removal and deletion safeguards ([ed80183](https://github.com/AmirHmZz/shipyard/commit/ed801833885e0c3660d11f54fa06ef62ae33f39a))
- improve application forms, routes, and variable management ([8453ec8](https://github.com/AmirHmZz/shipyard/commit/8453ec889565aba44c65404716ded513aa7b4ea8))
- validate DNS providers and simplify route configuration ([85ff496](https://github.com/AmirHmZz/shipyard/commit/85ff496f8bcf7ad03d05c1f3e65552dfc703babd))

### Bug Fixes

- **ci:** verify platform manifests independently ([70d9446](https://github.com/AmirHmZz/shipyard/commit/70d9446324533f94433c1888c4368c9b2c1ccccb))

## 0.1.0 (2026-10-17)

### Features

- introduce Shipyard deployment platform ([1725d2c](https://github.com/AmirHmZz/shipyard/commit/1725d2c44673298104fede137cb8883b5cb1977d))

### Bug Fixes

- **ci:** make Linux fixtures independent of checkout and DNS search paths ([2028da9](https://github.com/AmirHmZz/shipyard/commit/2028da9589a7f6a24e7b732a3c9c5a93f8372c27))

## Changelog

Release notes are maintained by Release Please. The first published release is 0.1.0.
