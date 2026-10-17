# Releases, migrations and System updates

`VERSION` is the authoritative product version, starting at **0.1.0**. The control plane, frontend, executor and installation assets share it. API versions, PostgreSQL schema numbers and dependencies are separate. Release builds embed version, source commit and build time in both binaries and OCI labels. Inspect them through `shipyard version`, `shipyard-executor version`, `GET /api/v1/version` and System updates. Sentry defaults to `shipyard@<version>` unless `SENTRY_RELEASE` overrides it.

## Publishing

Public releases belong to `AmirHmZz/shipyard`; images are `ghcr.io/amirhmzz/shipyard` and `ghcr.io/amirhmzz/shipyard-executor`. Publication requires repository access and a successful GitHub Actions run. Local development does not publish a release.

Enable Actions permission to create pull requests. The workflow uses only `GITHUB_TOKEN`: contents/pull requests/issues write for Release Please, actions write for explicit validation dispatch, and packages write for image publication. Set both GHCR packages to **public** and allow repository Actions access. Publication requires anonymous pulls of both image digests.

Use squash merges with Conventional Commit titles: `fix: ...` increments patch, `feat: ...` increments minor. `feat!: ...` or a `BREAKING CHANGE:` footer increments minor before 1.0 and major afterward. Preserve generated release PR titles/labels. The manifest's initial `0.0.0` is Release Please's unreleased sentinel; `initial-version` selects 0.1.0.

The reusable validation workflow covers Go race/static checks, frontend checks/builds, contract drift, browser behavior and Linux Docker/Compose/HAProxy integration. Release Please creates one repository-wide version/changelog PR. Generated release branches are explicitly dispatched for validation because token-generated events do not trigger normal follow-up workflows. Merging the release PR creates a draft release/tag; publication runs from the release workflow itself.

Both AMD64/ARM64 images carry exact version tags, OCI metadata, SBOMs and provenance. Assets include `install.sh`, production `compose.host.yaml` with no source builds, `SHA256SUMS`, and `release.json`. The manifest records image digests, source commit, schema, migration checksums/impacts, supported predecessor, updater protocol, architectures and runtime requirements. Production PostgreSQL is pinned by digest too.

Releases remain draft until validation, image publication, anonymous pulls, artifact checks and preceding-release migration checks succeed. Published releases are not overwritten. To retry failed publication, run **Release** manually with the existing draft `vX.Y.Z` tag. Validation checks that tag's source; draft assets can be retried, while a published target is refused. Review both architecture manifests before distributing the installer.

## Administrator workflow

Open **Settings → System updates**, then **Check for updates**. Checks and installation are always manual. Only normal releases from the trusted repository are accepted. Available steps are the tested next release or the current release's predecessor; skipped versions require intermediate steps.

Preview the version change to see release notes and migration impacts. Plans expire after fifteen minutes and bind the administrator, installation revision, source/target releases and exact migration path. Every execution requires a newly entered backup passphrase of at least twelve characters. Keep it. Destructive changes additionally require approving the listed data loss and typing the target version. Unsupported reverse migrations remain blocked.

The detached protected updater uses the **currently installed executor image**, survives replacement of both ordinary components, and exposes no network endpoint. It checks artifacts, compatibility, Docker identity, disk space and migration checksums; pulls images; enters maintenance and waits at most fifteen minutes for running jobs without terminating deployments. It creates the encrypted backup, removes the saved passphrase, stops the control plane, applies migrations, recreates both components, and verifies versions, ingress attachment and HTTPS before restoring prior maintenance state.

PostgreSQL, HAProxy and application containers remain running. Their major/image upgrades are separate operations. Database state and a root-only, atomically synced journal under `/var/lib/shipyard/upgrades/<operation-id>` support resumption. The UI reconnects after replacement. Download the encrypted backup from its panel. Backups remain until an administrator explicitly removes the exact archive; historical operation IDs remain accessible through authenticated operation/backup endpoints.

Pre-application failures preserve the installed version. Automatic recovery after application begins requires compatible images and an actual **non-destructive** reverse path. Otherwise `recovery_required` retains maintenance, journal and backup for deliberate repair or [restoration](recovery.md). Approved destructive downgrades do not recreate discarded values.

## Migration authoring

Never modify published migration numbers or contents. Existing 001–003 up files and applied history remain intact. Each migration has `<number>_<name>.sql`, paired `.down.sql`, and `.json` metadata with `name`, `up` and `down`. Each direction requires `classification` (`non-destructive`, `destructive`, `unsupported`) and an administrator-readable `impact`. Unsupported directions still have a paired file; the runner refuses to execute them.

SQL checksums use SHA-256 after LF normalization. Explicit migration commands adopt checksum metadata for known legacy rows without replaying SQL. Unknown/gapped history and mismatched checksums are rejected. Include required JSON/data compatibility transformations in SQL migrations; a down path restores compatible schema, not discarded values. The entire path and history commit together under the database advisory lock. Use SQL that supports one PostgreSQL transaction.

Native startup refuses incompatible or empty databases. Installer/updater commands deliberately migrate first. Fresh development/test databases retain convenience initialization, but existing databases are not automatically upgraded at startup.

```sh
shipyard migrate status
shipyard migrate catalog
shipyard migrate plan 3
shipyard migrate apply 3
```

Supply `DATABASE_URL` securely. `--allow-data-loss` explicitly acknowledges destructive CLI paths; the panel additionally requires administrator approval and the typed version. Test populated up/down paths, JSON compatibility, history/checksum refusal, transaction rollback and backup restoration before publishing.

Docker Desktop keeps `compose.yaml` and source builds. System updates is disabled without a native release installation manifest. No existing installation, connection, application or data is automatically converted/reset.

References: [Release Please](https://github.com/googleapis/release-please-action), [GitHub workflow triggers](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), [HTTP-01 requirements](https://letsencrypt.org/docs/challenge-types/#http-01-challenge).
