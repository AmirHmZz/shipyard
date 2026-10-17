# Native Linux installation

Shipyard deploys to its own rootful Docker Engine without SSH credentials. The release installer brings up PostgreSQL, the control plane, its protected executor and HAProxy 3.4. The dashboard becomes available only after obtaining a valid HTTPS certificate. There is no native HTTP setup listener or published backend/database port.

## Requirements

Use native Linux on AMD64 or ARM64 with Docker Engine 27+, Compose 2.24+, curl, sha256sum and standard shell utilities. Install Docker separately. Docker Desktop remains supported by the development configuration; rootless Docker is not a native installation target.

Have an exact dashboard hostname and the host's public IPv4 and/or IPv6 addresses available. Public ports 80 and 443 must be unused and reachable from the internet. HTTP-01 requires public port 80 throughout issuance and renewal. Configure DNS-only A/AAAA records; every returned address must match this host. Remove stale AAAA records when IPv6 does not reach the host. No DNS-provider credentials are needed for dashboard HTTPS.

## Install

After the first public release is published:

```sh
curl -fL https://github.com/AmirHmZz/shipyard/releases/latest/download/install.sh -o install.sh
sudo sh install.sh
```

The installer asks for the dashboard hostname, detects public addresses and lets you correct them, asks for CA terms consent, and prints the DNS records to create. Certificate contact email is optional through `--email`. Keep the installer running while you create DNS records. It reports pending/mismatched DNS, certificate and routing errors while waiting. When HTTPS is ready it prints the setup URL and a first-administrator bootstrap token once. Create the first administrator through that HTTPS URL.

For unattended input or an explicit release:

```sh
sudo sh install.sh --version 0.1.0 --domain panel.example.com \
  --public-ipv4 203.0.113.10 --email admin@example.com --accept-acme-tos
```

Use real public addresses. Supply `--public-ipv6` for IPv6, alone or with IPv4. The explicit terms flag records your consent; do not set it without accepting the CA terms. Published control-plane/executor images are pulled by digest after installation-artifact checksum verification.

Installation files and credentials live under `/opt/shipyard`; managed host workspaces remain under `/var/lib/shipyard`. Keep their restrictive permissions. The Docker socket's group is detected for the control plane. The root executor has Docker/Compose/Buildx, host networking and a persistent workspace, with no network endpoint. Socket access is administrative access to the host.

If installation is interrupted, rerun the same installer/version and hostname. Existing keys and data are preserved. Re-running does not change an installed version; use System updates for that. The bootstrap token is not printed again after successful first presentation; root can read it from the installation's private .env if it was lost before account creation.

## Local deployments

Servers contains a protected **Local host** with verified Docker daemon identity. Configure its public addresses and explicitly grant it to teams. No SSH fields or provisioning action are needed. Applications, networks, logs, metrics, container terminals and exact-image rollback use the same interfaces as SSH hosts. Infrastructure containers, system routes and the protected ingress network cannot be managed as applications.

The dashboard has a persistent private ingress address. Shipyard reattaches and verifies that address after container recreation. HAProxy always uses host networking and reaches this private address directly on port 8080. Applications use their own managed ingress addresses. No control-plane backend port is published.

## Dashboard access and recovery

**Settings → Dashboard access** changes the hostname, shows separate DNS/propagation/certificate/routing states, and retries failures. Point the new hostname at the host before saving it. The previous HTTPS route remains available while issuance and verification are pending; the new origin becomes canonical only after success. Valid certificates remain installed if renewal fails.

Root can use the packaged CLI without opening HTTP access:

```sh
cd /opt/shipyard
docker compose -f compose.host.yaml exec -T shipyard shipyard dashboard-access status
docker compose -f compose.host.yaml exec -T shipyard shipyard dashboard-access configure panel.example.com
docker compose -f compose.host.yaml exec -T shipyard shipyard dashboard-access retry
```

Keep public port 80 available for renewals. Application and wildcard certificates continue using the Cloudflare/ArvanCloud DNS-01 integrations. See [release operations](releases.md) and [backup/restore](recovery.md).
