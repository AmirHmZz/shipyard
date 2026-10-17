# Backup, restore and failed version changes

Use **Settings → System updates** for routine upgrades and downgrades. Every operation creates an encrypted backup and previews migration impacts. See [release operations](releases.md). Avoid replacing native images manually around the updater or removing persistent volumes.

Administrators can also enable maintenance in Settings, wait for running jobs, and export an encrypted backup. Archives include PostgreSQL, durable control-plane files, certificate/account material and the master key. Version-change archives additionally contain the installation .env, Compose and release/installation manifests inside the encrypted payload. Protect the archive and its passphrase separately.

Application volumes, release images and remote workspaces are excluded. Preserve /var/lib/shipyard and Docker's application images/volumes separately when needed for application rollback. Restoring the panel cannot recreate missing application data.

## Failed version changes

Root-only operation state and encrypted backups live under /var/lib/shipyard/upgrades/<operation-id>. Preflight failures preserve the installed version. Automatic recovery restores compatible images and only non-destructive reverse migrations. **recovery_required** retains maintenance when this is unsafe. It never runs an unapproved destructive recovery.

Inspect the operation panel, its operation.json journal and protected updater logs. Preserve the journal and archive. Repair host/network faults or restore the pre-change archive with its recorded source release. Do not modify database history/checksums to force startup.

## Restore

Stop the control plane and any active updater. Use an **empty PostgreSQL database**, matching PostgreSQL 18 tools, and the product version recorded in the backup. Supply DATABASE_URL and a writable SHIPYARD_DATA_DIR, then run:

```sh
shipyard restore /secure/path/backup.sybackup
```

Enter the passphrase through stdin and end with EOF, or provide stdin from a secret-management tool. Do not place it in command arguments or logs. Restore refuses an existing database and restores PostgreSQL transactionally. It writes restored-master-key under the data directory with mode 0600. Set SHIPYARD_MASTER_KEY from that file before starting. Ensure restored control-plane files are readable by UID 10001.

Version-change archives restore installation files under <data-directory>/installation/. Root must review and restore those files to /opt/shipyard, including the source release's digest-pinned images and original master key. Keep .env mode 0600, install.json mode 0640 root:10001, and the installation directory mode 0750 root:10001. Do not replace source images with a journal's pending target.

Restore deletes saved version-change requests/plans/history and forces maintenance, preventing stale requests from replaying. A host journal alone cannot authorize another operation. Verify Docker identity and ingress attachment before resuming workers. If deliberately restoring to a different Engine, independently inspect its identity on that intended host, then acknowledge it:

```sh
cd /opt/shipyard
docker compose -f compose.host.yaml exec -T shipyard shipyard local-host verify VERIFIED_DAEMON_ID
```

Verify users, fingerprints, application traffic and HTTPS before deliberately disabling maintenance. Missing application images/data still require separate recovery.

## Dashboard HTTPS recovery

Correct the dashboard A/AAAA records and keep public port 80 reachable. Inspect or retry without opening an HTTP dashboard listener:

```sh
cd /opt/shipyard
docker compose -f compose.host.yaml exec -T shipyard shipyard dashboard-access status
docker compose -f compose.host.yaml exec -T shipyard shipyard dashboard-access retry
docker compose -f compose.host.yaml exec -T shipyard shipyard dashboard-access configure panel.example.com
```

Failed hostname changes preserve the previous working HTTPS route. Renewal failures preserve an unexpired certificate. There is no loopback HTTP recovery command.

Application rollback separately restores retained exact images/configuration while preserving volumes. It cannot reverse application database migrations. Missing images, fixed-address conflicts and failed recovery are reported explicitly.
