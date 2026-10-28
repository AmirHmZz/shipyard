# Shipyard

For tasks that run to completion, see [Job applications](docs/jobs.md): manual and cron execution, retries, cancellation, and retained logs.

A focused, self-hosted deployment control plane. Go + PostgreSQL, Vite/React/TypeScript, shadcn/ui + Tailwind, and HAProxy Community. Deploy to the native Linux installation host or independent Docker hosts over SSH; no Swarm, Kubernetes, Redis, database catalog, or deployment templates.

## Install

Requires a Linux control-plane host with Docker Engine and the Compose plugin. Windows/macOS can develop using Docker Desktop.

For native Linux, use the [release installer](docs/local-host.md) once the first release is published:

```sh
curl -fL https://github.com/AmirHmZz/shipyard/releases/latest/download/install.sh -o install.sh
sudo sh install.sh
```

Enter the dashboard hostname, point its DNS records at the server and accept the CA terms. Shipyard obtains HTTPS through HTTP-01, then prints the setup URL and first-administrator bootstrap token. No DNS API token or native HTTP setup listener is needed. Public ports 80/443 are required; backend and database ports remain private.

Administrators manage tested upgrades and downgrades under **Settings → System updates**. Every change creates an encrypted backup with a newly entered passphrase. See [versioning, publication and migrations](docs/releases.md).

For Docker Desktop/development or a control plane using an independently managed reverse proxy:

```sh
node scripts/configure.mjs --origin http://localhost:8080
docker compose up -d --build
```

Open `http://localhost:8080`. Create the first administrator using the bootstrap token in `.env`. The installation helper creates random keys and refuses to overwrite an existing `.env`. To bootstrap a remote host, forward port 8080 over SSH. The default Compose binding is loopback-only.

For public access, place the dashboard behind an HTTPS reverse proxy and set `SHIPYARD_ORIGIN` to its exact external origin. Forward WebSocket upgrades and do not buffer SSE responses. Keep PostgreSQL private. Do not change the master key after saving credentials; back it up with the database.

Certificate email is optional. For certificates, explicitly accept the CA's terms using `SHIPYARD_ACME_ACCEPT_TOS=true`. Start with the staging directory in `.env.example` to avoid production issuance limits.

Backend errors/panics and browser errors are reported to the configured Sentry project. The supplied DSN is enabled by default. Set `SENTRY_DSN` to override it, or set `SENTRY_DSN=` to disable reporting in both the backend and dashboard. Optional `SENTRY_ENVIRONMENT` (default `production`) and `SENTRY_RELEASE` identify events. These are runtime settings; the dashboard reads public configuration from `/api/v1/telemetry`. Request bodies, cookies, headers, URL queries, user identity, and breadcrumbs are excluded. Session replay and performance tracing are not enabled.

## First deployment

Delete a project from its card's action menu or project settings area, and delete an application from its detail page. Type its exact name to confirm. Project deletion includes all environments, applications and previews; application deletion includes its previews. Cleanup runs as a durable background job and removes containers, networks, routes, Shipyard-owned DNS records, deployment history and managed release files. Persistent volumes and bind-mounted data remain on the host. Resources become read-only while cleanup runs; failures appear on the resource page with a retry action. Operators can delete assigned projects/applications; viewers cannot. Audit events are retained.

1. Create a team and a project, then an environment such as production.
2. Use the automatically registered **Local host** in a native installation, or connect a remote server using an SSH private key (recommended) or password. Credentials are encrypted and write-only. Password authentication must be enabled on the target SSH server. Probe its host fingerprint and compare it with a separately trusted value. The SSH user needs Docker access, local TCP forwarding for readiness probes, local Unix socket forwarding for HAProxy reload verification, and write access to `/var/lib/shipyard`; provisioning requires root. For example, configure `AllowTcpForwarding local` and `AllowStreamLocalForwarding local` for that user in sshd.
3. For remote servers, explicitly provision missing Docker/Compose prerequisites on a supported Debian/Ubuntu server, or prepare Docker, Compose, Buildx, and the managed directory yourself. Local host uses the bundled executor. Ports 80/443 must be free for HAProxy.
4. Grant the server to your team. For Git deployments, also add and grant a GitHub App or Gitea connection under Integrations.
5. Add a DNS provider, import an existing zone, and grant the zone to the team. Open a domain from the DNS & domains table to manage its records and inspect its certificates, validity dates, covered names, issuer, and renewal status.
6. Create an application. Choose **Git repository** for Dockerfile/Compose files from a repository, or **Direct Compose** to paste YAML into the dashboard editor without Git. Configure variables and readiness checks.
7. Add routes to the application and deploy. Managed domains create DNS-only address records and use DNS-01 for automatic certificates.

Direct Compose supports a single YAML document up to 1 MiB, using service images or `build.dockerfile_inline` with `context: .`. There is no repository workspace: file references such as `env_file`, file-backed secrets/configs and bind mounts must use absolute paths on the destination host. Use named volumes for persistent data. For builds that need local source files, choose a Git repository instead.

Operators can edit the saved YAML under the application's **Compose** tab. **Save** updates the document; **Save & deploy** queues that saved revision. YAML and queued source snapshots are encrypted, and viewers cannot retrieve the source. Each deployment snapshots the YAML, pins service images and retains the configuration for rollback. Later editor changes do not change queued deployments. Direct Compose has no Git connection, push deployments or PR previews. Define domain routes using each Compose service name and container port as usual.

For Git Compose applications, choose **Compose document → Write compose in Shipyard** to keep the repository checkout while writing YAML in the dashboard. Relative build contexts, Dockerfiles and repository files use the selected build context. Git push deployments and PR previews remain available; each deployment freezes both its Git revision and saved YAML.

When a deployment renders a Compose document with renamed or removed services, Shipyard deletes domains and service-specific networking/published-port settings that reference absent services before building images. These deletions remain effective if the build fails. Shared networks, persistent data and services in inactive profiles are preserved. Readiness checks and job targets still require explicit correction when their service names change.

Live logs follow new output while you are at the bottom. Scroll up to hold your reading position, then select **Jump to latest** to resume following.

The Compose editor uses Monaco with light/dark themes, folding, search, word wrap, formatting and schema-based YAML completion/diagnostics. Monaco and its workers are bundled with Shipyard. The Compose schema is vendored locally; editor content and schema requests are not sent to external services. Editor diagnostics are advisory; the destination's Docker Compose validates the deployment configuration.

Under Integrations → Source control, choose **Add connection**. GitHub's guided setup creates an App for your personal account or organization, imports its credentials, and redirects you to select repositories. Grant Contents:read and Pull requests:read with `push` and `pull_request` events. Existing App credentials remain available under **Advanced: manual credentials**.

For Gitea 1.23+, add your instance once: register a confidential OAuth2 application in Gitea Settings → Applications using the callback URL shown by Shipyard, then save its client ID and client secret. Choose **Authorize Gitea** for browser consent. Shipyard requests only `read:user read:repository`, encrypts the tokens, and refreshes them automatically. Reconnect when authorization is revoked. Manual token connections remain supported.

**Configure Gitea webhooks yourself.** Open the connection, copy its webhook URL, and generate a signing secret to copy into Gitea. Enable JSON payloads and push/pull_request events. Generated secrets are shown once; replacing one requires updating your Gitea webhook. Reconnecting OAuth leaves the webhook URL and signing secret unchanged. Shipyard never creates, edits, or deletes Gitea webhooks. Last accepted delivery reports only requests Shipyard has successfully authenticated, not a verification of provider settings.

Guided setup requires a stable HTTPS `SHIPYARD_ORIGIN`, accessible to your browser; webhooks also require access from the Git provider. Callback state is single-use, expires after 15 minutes, and is bound to the administrator's session. Starting or resuming authorization refreshes session-cookie attributes for the external callback without changing its database expiry.

HTTPS/gRPC routing uses domain maps: for example `api.example.com` → API and `example.com` → frontend. Request paths pass through unchanged. Exact domains take precedence over wildcards; a wildcard does not match its apex. Each hostname has one web route. TCP uses dedicated listeners.

To remove old non-root path routes explicitly, run `docker compose exec shipyard shipyard cleanup-path-routes` after rebuilding. It deletes only web routes whose legacy path is neither empty nor `/`, cleans up owned DNS records safely, and queues affected proxies for reconciliation. Whole-domain/TCP routes, applications, and releases remain. This command is idempotent and never runs automatically.

Cloudflare uses a zone-scoped token with Zone:Read and DNS:Edit. ArvanCloud uses its API key and CDN v4 API. Domain registration and nameserver delegation remain with your provider. Record types A, AAAA, CNAME, TXT, MX, NS, SRV, and CAA are supported. The DNS editor preserves provider payloads and exposes structured JSON for complex records.

See [Configuration pages and container networking](docs/networking.md) for bridge IPAM, per-service hostnames, administrator-only published ports, application previews, SSH forwarding and the explicit pre-activation project reset.

## Operational behavior

- Each application targets one host. Dockerfile web/gRPC releases are prepared alongside the active release and switched after readiness passes. Old containers have a bounded 60-second drain window; long-lived sessions may need to reconnect afterward. Background workers and Compose stacks use recreate deployment.
- Rollback restores retained image IDs, configuration and environment snapshots without rebuilding. It does not reverse migrations or application data writes. Named Compose volumes are never removed by a normal deployment or rollback. Keep schema changes backward compatible.
- Use Docker healthchecks or a configurable HTTP readiness path. Otherwise readiness confirms running containers and reachable reserved container IPs through SSH forwarding; it cannot prove application-level correctness. Default deadline: 120 seconds.
- HAProxy redirects HTTP to HTTPS and handles HTTPS, WebSockets, HTTP/2 gRPC, and dedicated-port TCP. TCP supports TLS termination and TLS passthrough; passthrough certificates belong to the application. Ports 22, 80 and 443 cannot be assigned to TCP routes. Raw TCP uses DNS-only records unless you separately supply a compatible proxy product.
- Destination proxies use `haproxy:3.4-alpine`. Administrators can open **Servers → HAProxy settings** to set listening IP addresses independently for the shared web frontend and each TCP frontend. Use `0.0.0.0` or `::` for all interfaces, or supply assigned IPv4/IPv6 addresses without ports or CIDR ranges. Defaults include IPv6 when the server has a configured public IPv6 address. Save & apply validates and reloads the proxy; failed changes retain the previous working settings. DNS addresses and listener ports are configured separately. Existing older testing containers must be recreated manually; Shipyard does not upgrade them automatically.
- Manage runtime variables after creating an application in its **Variables** tab. Ordinary variables are stored as plaintext and visible to project readers. Enable **Secret** for encrypted, write-only values; existing encrypted variables remain secrets. Build secrets always use encrypted storage and BuildKit file mounts. Preview variables must be configured explicitly. Redeploy to apply changes. Known secret values are redacted from logs, but applications must still avoid printing credentials in transformed/encoded forms.
- Git applications configure PR previews in their own Previews section using a connected zone and a unique wildcard such as `*.preview.example.com`. Disabling previews queues cleanup and retains settings/history. Same-repository branches deploy automatically. Forks require approval for the exact commit, and previews inherit only explicitly configured preview variables. Previews reject host bindings, fixed published ports, external/global volumes and networks, fixed container names, and privileged namespaces/devices. Closing a PR removes its owned ephemeral resources.
- Metrics poll every 30 seconds. Defaults: 30 days of metrics, 30 days of deployment logs, 90 days of audit entries, ten successful releases. Active releases are protected. Alert webhooks use HMAC-SHA256 when configured, stable delivery IDs, retries, and recovery events.
- Configure resource thresholds and sustained/offline durations in Monitoring → Defaults or a resource's policy. Settings → Alerts redirects there. Settings → Users lets administrators disable users and assign administrator access. Disabling a user or changing their access revokes sessions; open streams recheck access. Team owners invite and remove members and grant project roles using copied invitation links.
- Shipyard is for trusted teams. Project roles control dashboard/API operations; arbitrary Docker/Compose workloads are not a hostile-tenant security boundary. Container terminal access is operator-only and audited. Applications keep running during control-plane outages.

See [recovery](docs/recovery.md), [architecture and API](docs/architecture.md), and [development/testing](docs/development.md).

### Monitoring and outbound proxies

Platform administrators can use **Monitoring** to inspect servers and applications, choose history ranges up to 30 days, and configure alert defaults or resource overrides. Collection runs every 30 seconds. Missing or stale data is shown separately from offline resources; idle Jobs and intentionally stopped applications do not produce availability alerts.

Add reusable **SOCKS5/SOCKS5H** connections in **Integrations**, then select a connection (or Direct) independently for DNS providers, notification integrations, and **Settings > Certificates**. SOCKS5 resolves destination names locally; SOCKS5H resolves through the proxy. Direct bypasses proxy environment variables. Git/OAuth and registry traffic do not use these settings.

For a proxy deployed as a Shipyard application on **Local host**, attach its service to a shared bridge in the application's **Networking** tab, then use **Networks → Attach Shipyard** on that bridge. Set a service network hostname and use it with the SOCKS container port in the integration. Shipyard saves its own attachments and restores them after restarts and updates; no Compose installation edits are required.

Notification integrations support generic signed webhooks, Telegram, and Bale. Messenger connections require a bot token and chat ID/channel username. Monitoring policies explicitly select destinations; existing event and team filters still apply. Saving a connection sends nothing; **Send test notification** queues an explicit delivery. Messenger and proxy credentials remain encrypted and write-only.
