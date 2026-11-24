# Shipyard

> A focused, self-hosted deployment control plane.

**Stack:** Go + PostgreSQL · Vite / React / TypeScript · shadcn/ui + Tailwind · HAProxy Community

Deploy to the native Linux installation host or to independent Docker hosts over SSH.

**What Shipyard deliberately does not include:** Swarm, Kubernetes, Redis, a database catalog, or deployment templates.

---

## Table of contents

- [Highlights](#highlights)
- [Installation](#installation)
  - [Requirements](#requirements)
  - [Native Linux (release installer)](#native-linux-release-installer)
  - [Docker Desktop, development, or an external reverse proxy](#docker-desktop-development-or-an-external-reverse-proxy)
  - [Public access behind a reverse proxy](#public-access-behind-a-reverse-proxy)
  - [Certificates (ACME)](#certificates-acme)
  - [Configuration reference](#configuration-reference)
  - [Error reporting (Sentry)](#error-reporting-sentry)
  - [Upgrades and downgrades](#upgrades-and-downgrades)
- [First deployment](#first-deployment)
- [Applications](#applications)
  - [Direct Compose](#direct-compose)
  - [Git Compose: write Compose in Shipyard](#git-compose-write-compose-in-shipyard)
  - [Building one image for multiple services](#building-one-image-for-multiple-services)
  - [Renamed or removed services](#renamed-or-removed-services)
  - [Compose editor](#compose-editor)
  - [Live logs](#live-logs)
  - [Deleting projects and applications](#deleting-projects-and-applications)
- [Source control integrations](#source-control-integrations)
  - [GitHub](#github)
  - [Gitea](#gitea)
  - [Gitea webhooks](#gitea-webhooks)
  - [Guided setup requirements](#guided-setup-requirements)
- [Routing, DNS and certificates](#routing-dns-and-certificates)
  - [Routing](#routing)
  - [Removing legacy path routes](#removing-legacy-path-routes)
  - [DNS providers](#dns-providers)
- [Operational behavior](#operational-behavior)
  - [Deployments and rollback](#deployments-and-rollback)
  - [Readiness checks](#readiness-checks)
  - [HAProxy](#haproxy)
  - [Variables and secrets](#variables-and-secrets)
  - [Pull request previews](#pull-request-previews)
  - [Retention and alert delivery](#retention-and-alert-delivery)
  - [Users, teams and access](#users-teams-and-access)
  - [Security model](#security-model)
- [Monitoring](#monitoring)
- [Outbound proxies](#outbound-proxies)
- [Notification integrations](#notification-integrations)
- [Further documentation](#further-documentation)

---

## Highlights

- **Two deployment targets:** the native Linux installation host (**Local host**) or independent Docker hosts reached over SSH.
- **Two application sources:** a **Git repository** (Dockerfile or Compose files) or **Direct Compose** (paste YAML into the dashboard editor, no Git required).
- **Built-in routing:** HAProxy handles HTTP→HTTPS redirects, HTTPS, WebSockets, HTTP/2 gRPC, and dedicated-port TCP.
- **DNS and certificates:** Cloudflare and ArvanCloud DNS integration, automatic certificates, and per-domain certificate inspection.
- **Safe releases:** readiness checks, switch-after-ready for web/gRPC releases, and rollback to retained image IDs, configuration and environment snapshots without rebuilding.
- **Source control:** GitHub App and Gitea integrations with push deployments and pull request previews.
- **Operations:** monitoring, alerts (signed webhooks, Telegram, Bale), audit logs, encrypted backups, and tested in-dashboard upgrades.
- **Teams:** teams, projects, project roles, and invitation links.

---

## Installation

### Requirements

A Linux control-plane host with **Docker Engine** and the **Compose plugin**. Windows and macOS can be used for development with Docker Desktop.

### Native Linux (release installer)

For native Linux, use the [release installer](docs/local-host.md) once the first release is published:

```sh
curl -fL https://github.com/AmirHmZz/shipyard/releases/latest/download/install.sh -o install.sh
sudo sh install.sh
```

1. Enter the dashboard hostname.
2. Point its DNS records at the server.
3. Accept the CA terms.

Shipyard obtains HTTPS through HTTP-01, then prints the setup URL and the first-administrator bootstrap token.

- No DNS API token or native HTTP setup listener is needed.
- Public ports **80/443** are required.
- Backend and database ports remain private.

### Docker Desktop, development, or an external reverse proxy

Use this path for Docker Desktop, for development, or for a control plane that sits behind an independently managed reverse proxy.

```sh
node scripts/configure.mjs --origin http://localhost:8080
docker compose up -d --build
```

Then open `http://localhost:8080` and create the first administrator using the bootstrap token in `.env`.

- The installation helper creates random keys and refuses to overwrite an existing `.env`.
- To bootstrap a remote host, forward port 8080 over SSH.
- The default Compose binding is loopback-only.

### Public access behind a reverse proxy

For public access, place the dashboard behind an HTTPS reverse proxy and set `SHIPYARD_ORIGIN` to its exact external origin.

- Forward WebSocket upgrades.
- Do not buffer SSE responses.
- Keep PostgreSQL private.
- **Do not change the master key after saving credentials.** Back it up together with the database.

### Certificates (ACME)

Certificate email is optional. To obtain certificates, you must explicitly accept the CA's terms with `SHIPYARD_ACME_ACCEPT_TOS=true`.

Start with the staging directory provided in `.env.example` to avoid production issuance limits.

### Configuration reference

| Variable                   | Purpose                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SHIPYARD_ORIGIN`          | Exact external origin of the dashboard (required for public access and for guided source-control setup; must be a stable HTTPS origin accessible to your browser). |
| `SHIPYARD_ACME_ACCEPT_TOS` | Set to `true` to explicitly accept the CA's terms for certificates.                                                                                                |
| `SENTRY_DSN`               | Overrides the default Sentry DSN. Set to an empty value (`SENTRY_DSN=`) to disable reporting in both the backend and dashboard.                                    |
| `SENTRY_ENVIRONMENT`       | Optional. Identifies events. Default: `production`.                                                                                                                |
| `SENTRY_RELEASE`           | Optional. Identifies events by release.                                                                                                                            |

See `.env.example` for the full set of options.

### Error reporting (Sentry)

Backend errors and panics, as well as browser errors, are reported to the configured Sentry project. The supplied DSN is **enabled by default**.

- Set `SENTRY_DSN` to override it, or set `SENTRY_DSN=` to disable reporting in both the backend and the dashboard.
- Optional `SENTRY_ENVIRONMENT` (default `production`) and `SENTRY_RELEASE` identify events.
- These are runtime settings; the dashboard reads its public configuration from `/api/v1/telemetry`.
- Request bodies, cookies, headers, URL queries, user identity, and breadcrumbs are excluded.
- Session replay and performance tracing are not enabled.

### Upgrades and downgrades

Administrators manage tested upgrades and downgrades under **Settings → System updates**. Every change creates an encrypted backup with a newly entered passphrase.

See [versioning, publication and migrations](docs/releases.md).

---

## First deployment

1. **Create a team and a project**, then an environment such as `production`.
2. **Choose a server.**
   - Use the automatically registered **Local host** in a native installation, or connect a remote server using an SSH private key (recommended) or password.
   - Credentials are encrypted and write-only.
   - Password authentication must be enabled on the target SSH server.
   - Probe its host fingerprint and compare it with a separately trusted value.
   - The SSH user needs:
     - Docker access,
     - local TCP forwarding for readiness probes,
     - local Unix socket forwarding for HAProxy reload verification,
     - write access to `/var/lib/shipyard`.
   - Provisioning requires root.
   - For example, configure `AllowTcpForwarding local` and `AllowStreamLocalForwarding local` for that user in `sshd`.
3. **Prepare the server.**
   - For remote servers, either explicitly provision missing Docker/Compose prerequisites on a supported Debian/Ubuntu server, or prepare Docker, Compose, Buildx, and the managed directory yourself.
   - The Local host uses the bundled executor.
   - Ports **80/443** must be free for HAProxy.
4. **Grant the server to your team.** For Git deployments, also add and grant a GitHub App or Gitea connection under **Integrations**.
5. **Set up DNS.** Add a DNS provider, import an existing zone, and grant the zone to the team. Open a domain from the **DNS & domains** table to manage its records and inspect its certificates, validity dates, covered names, issuer, and renewal status.
6. **Create an application.**
   - Choose **Git repository** for Dockerfile/Compose files from a repository, or **Direct Compose** to paste YAML into the dashboard editor without Git.
   - Configure variables and readiness checks.
7. **Add routes and deploy.** Add routes to the application and deploy. Managed domains create DNS-only address records and use DNS-01 for automatic certificates.

---

## Applications

### Direct Compose

Direct Compose supports a single YAML document up to **1 MiB**, using service images or `build.dockerfile_inline` with `context: .`.

- There is no repository workspace. File references such as `env_file`, file-backed secrets/configs, and bind mounts must use **absolute paths on the destination host**.
- Use named volumes for persistent data.
- For builds that need local source files, choose a Git repository instead.

Operators can edit the saved YAML under the application's **Compose** tab:

- **Save** updates the document.
- **Save & deploy** queues that saved revision.

Additional behavior:

- YAML and queued source snapshots are encrypted, and viewers cannot retrieve the source.
- Each deployment snapshots the YAML, pins service images, and retains the configuration for rollback.
- Later editor changes do not change queued deployments.
- Direct Compose has no Git connection, push deployments, or PR previews.
- Define domain routes using each Compose service name and container port as usual.

### Git Compose: write Compose in Shipyard

For Git Compose applications, choose **Compose document → Write compose in Shipyard** to keep the repository checkout while writing the YAML in the dashboard.

- Relative build contexts, Dockerfiles, and repository files use the selected build context.
- Git push deployments and PR previews remain available.
- Each deployment freezes both its Git revision and the saved YAML.

### Building one image for multiple services

To build one image for multiple Compose services, declare `build` and `image` on one service and use the same `image` value on the others without `build`.

- Shipyard builds that service once, resolves consumers of the exact same image name to its release image, and pins every service to the resulting image ID.
- The builder must be enabled by the selected profiles.
- If multiple build services declare that image name, image-only consumers are rejected as ambiguous.

### Renamed or removed services

When a deployment renders a Compose document with renamed or removed services, Shipyard deletes domains and service-specific networking/published-port settings that reference absent services **before** building images.

- These deletions remain effective if the build fails.
- Shared networks, persistent data, and services in inactive profiles are preserved.
- Readiness checks and job targets still require explicit correction when their service names change.

### Compose editor

The Compose editor uses Monaco with light/dark themes, folding, search, word wrap, formatting, and schema-based YAML completion and diagnostics.

- Monaco and its workers are bundled with Shipyard.
- The Compose schema is vendored locally. Editor content and schema requests are not sent to external services.
- Editor diagnostics are advisory; the destination's Docker Compose validates the deployment configuration.

### Live logs

Live logs follow new output while you are at the bottom. Scroll up to hold your reading position, then select **Jump to latest** to resume following.

### Deleting projects and applications

Delete a project from its card's action menu or project settings area, and delete an application from its detail page. Type its exact name to confirm.

- Project deletion includes all environments, applications, and previews. Application deletion includes its previews.
- Cleanup runs as a durable background job and removes containers, networks, routes, Shipyard-owned DNS records, deployment history, and managed release files.
- **Persistent volumes and bind-mounted data remain on the host.**
- Resources become read-only while cleanup runs. Failures appear on the resource page with a retry action.
- Operators can delete assigned projects/applications; viewers cannot.
- Audit events are retained.

For tasks that run to completion, see [Job applications](docs/jobs.md).

---

## Source control integrations

### GitHub

Under **Integrations → Source control**, choose **Add connection**.

- GitHub's guided setup creates an App for your personal account or organization, imports its credentials, and redirects you to select repositories.
- Grant `Contents:read` and `Pull requests:read` with `push` and `pull_request` events.
- Existing App credentials remain available under **Advanced: manual credentials**.

### Gitea

Supported for **Gitea 1.23+**. Add your instance once:

1. Register a **confidential OAuth2 application** in Gitea under **Settings → Applications**, using the callback URL shown by Shipyard.
2. Save its client ID and client secret in Shipyard.
3. Choose **Authorize Gitea** for browser consent.

Details:

- Shipyard requests only `read:user read:repository`, encrypts the tokens, and refreshes them automatically.
- Reconnect when authorization is revoked.
- Manual token connections remain supported.

### Gitea webhooks

**Configure Gitea webhooks yourself.**

1. Open the connection and copy its webhook URL.
2. Generate a signing secret and copy it into Gitea.
3. Enable JSON payloads and `push` / `pull_request` events.

Notes:

- Generated secrets are shown once. Replacing one requires updating your Gitea webhook.
- Reconnecting OAuth leaves the webhook URL and signing secret unchanged.
- Shipyard never creates, edits, or deletes Gitea webhooks.
- **Last accepted delivery** reports only requests Shipyard has successfully authenticated. It is not a verification of provider settings.

### Guided setup requirements

- Guided setup requires a stable HTTPS `SHIPYARD_ORIGIN`, accessible to your browser. Webhooks also require access from the Git provider.
- Callback state is single-use, expires after 15 minutes, and is bound to the administrator's session.
- Starting or resuming authorization refreshes session-cookie attributes for the external callback without changing its database expiry.

---

## Routing, DNS and certificates

### Routing

HTTPS/gRPC routing uses **domain maps**: for example, `api.example.com` → API and `example.com` → frontend.

- Request paths pass through unchanged.
- Exact domains take precedence over wildcards. A wildcard does not match its apex.
- Each hostname has one web route.
- TCP uses dedicated listeners.

### Removing legacy path routes

To explicitly remove old non-root path routes, run the following after rebuilding:

```sh
docker compose exec shipyard shipyard cleanup-path-routes
```

- It deletes only web routes whose legacy path is neither empty nor `/`.
- It cleans up owned DNS records safely and queues affected proxies for reconciliation.
- Whole-domain/TCP routes, applications, and releases remain.
- The command is idempotent and never runs automatically.

### DNS providers

| Provider       | Credentials                                        |
| -------------- | -------------------------------------------------- |
| **Cloudflare** | Zone-scoped token with `Zone:Read` and `DNS:Edit`. |
| **ArvanCloud** | API key (uses the CDN v4 API).                     |

- Domain registration and nameserver delegation remain with your provider.
- Supported record types: `A`, `AAAA`, `CNAME`, `TXT`, `MX`, `NS`, `SRV`, `CAA`.
- The DNS editor preserves provider payloads and exposes structured JSON for complex records.

For bridge IPAM, per-service hostnames, administrator-only published ports, application previews, SSH forwarding, and the explicit pre-activation project reset, see [Configuration pages and container networking](docs/networking.md).

---

## Operational behavior

### Deployments and rollback

- **One host per application.** Each application targets one host.
- **Web/gRPC releases (Dockerfile):** prepared alongside the active release and switched after readiness passes. Old containers have a bounded **60-second drain window**; long-lived sessions may need to reconnect afterward.
- **Background workers and Compose stacks:** use recreate deployment.
- **Rollback** restores retained image IDs, configuration, and environment snapshots without rebuilding. It does not reverse migrations or application data writes. Named Compose volumes are never removed by a normal deployment or rollback. Keep schema changes backward compatible.

### Readiness checks

Use Docker healthchecks or a configurable HTTP readiness path. Otherwise, readiness confirms running containers and reachable reserved container IPs through SSH forwarding; it cannot prove application-level correctness. Default deadline: **120 seconds**.

### HAProxy

- HAProxy redirects HTTP to HTTPS and handles HTTPS, WebSockets, HTTP/2 gRPC, and dedicated-port TCP.
- TCP supports TLS termination and TLS passthrough. Passthrough certificates belong to the application.
- Ports **22, 80, and 443** cannot be assigned to TCP routes.
- Raw TCP uses DNS-only records unless you separately supply a compatible proxy product.
- Destination proxies use `haproxy:3.4-alpine`.
- Administrators can open **Servers → HAProxy settings** to set listening IP addresses independently for the shared web frontend and each TCP frontend:
  - Use `0.0.0.0` or `::` for all interfaces, or supply assigned IPv4/IPv6 addresses without ports or CIDR ranges.
  - Defaults include IPv6 when the server has a configured public IPv6 address.
  - **Save & apply** validates and reloads the proxy; failed changes retain the previous working settings.
  - DNS addresses and listener ports are configured separately.
- Existing older testing containers must be recreated manually; Shipyard does not upgrade them automatically.

### Variables and secrets

Manage runtime variables after creating an application, in its **Variables** tab.

- Ordinary variables are stored as plaintext and are visible to project readers.
- Enable **Secret** for encrypted, write-only values. Existing encrypted variables remain secrets.
- Build secrets always use encrypted storage and BuildKit file mounts.
- Preview variables must be configured explicitly.
- Redeploy to apply changes.
- Known secret values are redacted from logs, but applications must still avoid printing credentials in transformed or encoded forms.

### Pull request previews

Git applications configure PR previews in their own **Previews** section, using a connected zone and a unique wildcard such as `*.preview.example.com`.

- Disabling previews queues cleanup and retains settings/history.
- Same-repository branches deploy automatically.
- Forks require approval for the exact commit.
- Previews inherit only explicitly configured preview variables.
- Previews reject host bindings, fixed published ports, external/global volumes and networks, fixed container names, and privileged namespaces/devices.
- Closing a PR removes its owned ephemeral resources.

### Retention and alert delivery

Metrics poll every **30 seconds**. Defaults:

| Data                | Default retention                  |
| ------------------- | ---------------------------------- |
| Metrics             | 30 days                            |
| Deployment logs     | 30 days                            |
| Audit entries       | 90 days                            |
| Successful releases | 10 (active releases are protected) |

Alert webhooks use HMAC-SHA256 when configured, stable delivery IDs, retries, and recovery events.

### Users, teams and access

- Configure resource thresholds and sustained/offline durations in **Monitoring → Defaults** or a resource's policy. **Settings → Alerts** redirects there.
- **Settings → Users** lets administrators disable users and assign administrator access.
- Disabling a user or changing their access revokes sessions; open streams recheck access.
- Team owners invite and remove members and grant project roles using copied invitation links.

### Security model

- Shipyard is for **trusted teams**. Project roles control dashboard/API operations; arbitrary Docker/Compose workloads are not a hostile-tenant security boundary.
- Container terminal access is operator-only and audited.
- Applications keep running during control-plane outages.

---

## Monitoring

Platform administrators can use **Monitoring** to inspect servers and applications, choose history ranges up to 30 days, and configure alert defaults or resource overrides.

- Collection runs every 30 seconds.
- Missing or stale data is shown separately from offline resources.
- Idle Jobs and intentionally stopped applications do not produce availability alerts.

---

## Outbound proxies

Add reusable **SOCKS5/SOCKS5H** connections in **Integrations**, then select a connection (or **Direct**) independently for:

- DNS providers,
- notification integrations,
- **Settings → Certificates**.

| Mode        | Behavior                                      |
| ----------- | --------------------------------------------- |
| **SOCKS5**  | Resolves destination names locally.           |
| **SOCKS5H** | Resolves destination names through the proxy. |
| **Direct**  | Bypasses proxy environment variables.         |

Git/OAuth and registry traffic do **not** use these settings.

### Running a proxy as a Shipyard application on Local host

1. Attach its service to a shared bridge in the application's **Networking** tab.
2. Use **Networks → Attach Shipyard** on that bridge.
3. Set a service network hostname and use it with the SOCKS container port in the integration.

Shipyard saves its own attachments and restores them after restarts and updates; no Compose installation edits are required.

---

## Notification integrations

Supported channels: generic signed webhooks, Telegram, and Bale.

- Messenger connections require a bot token and a chat ID or channel username.
- Monitoring policies explicitly select destinations; existing event and team filters still apply.
- Saving a connection sends nothing. **Send test notification** queues an explicit delivery.
- Messenger and proxy credentials remain encrypted and write-only.

---

## Further documentation

| Topic                                                                          | Document                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------- |
| Job applications (manual/cron execution, retries, cancellation, retained logs) | [docs/jobs.md](docs/jobs.md)                 |
| Native installation (release installer)                                        | [docs/local-host.md](docs/local-host.md)     |
| Versioning, publication and migrations                                         | [docs/releases.md](docs/releases.md)         |
| Configuration pages and container networking                                   | [docs/networking.md](docs/networking.md)     |
| Recovery                                                                       | [docs/recovery.md](docs/recovery.md)         |
| Architecture and API                                                           | [docs/architecture.md](docs/architecture.md) |
| Development and testing                                                        | [docs/development.md](docs/development.md)   |
