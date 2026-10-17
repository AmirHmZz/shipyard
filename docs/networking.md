# Configuration pages and container networking

Long forms live under `/configure/{kind}/{id-or-new}`; application networking, variables and previews live in the application workspace. Cancel returns to the originating page. Navigation away from edited forms asks before discarding changes. DNS record creation/editing also has a direct URL. Short confirmations and one-time secrets remain dialogs.

Connect DNS zones from **DNS & domains → Add zone**. Select a Cloudflare/ArvanCloud connection and choose an available provider domain. Shipyard verifies that provider ID server-side and uses its canonical domain as the zone name. Already connected domains are excluded. Provider credentials are configured separately under Integrations.

Routes select a connected zone and optional subdomain/wildcard. The full hostname identifies each route; there is no separate custom route name. HTTPS and gRPC terminate TLS and always redirect HTTP; gRPC uses h2c inside Docker. TCP uses a dedicated listener with termination or passthrough. Plaintext TCP, HTTP-only routes, path routing and backend TLS settings are rejected. Compose target services come from the resolved source; discovery returns names and replica counts without interpolated secrets. Deployment checks the immutable source again.

## Networks

HAProxy remains `haproxy:3.4-alpine` with `--network=host`. Each application with routes receives its own managed ingress bridge. Only routed services join it. Each release/container, including Compose replicas, gets a distinct reserved address before startup. HAProxy uses the verified address and container port, preserving replacement/readiness/switch/drain for eligible Dockerfile applications.

Administrators create or register bridges under **Networks**, then grant them to teams. External bridges remain owned by their original operator; unregistering never deletes them from Docker. Managed networks cannot be deleted while attached, desired by an application, or referenced by retained releases. Failed jobs preserve resources and diagnostics; retrying deletion reruns ownership checks.

Configure additional attachments and per-service hostnames in the application's **Networking** tab. Changes apply on the next deployment. A fixed address must be in the network subnet, outside its dynamic allocation pool, and unused. IPv4 network/broadcast/gateway addresses are unavailable. Registered external networks need a distinct IPAM dynamic range to guarantee fixed reservations. Fixed service addresses require one container and recreate deployment. Compose controls replicas when no single fixed service address is chosen. Rollback restores exact saved settings and fails on conflicts rather than choosing another fixed IP.

Compose `ports` declarations are removed from effective deployment configuration, leaving saved YAML untouched. A notice identifies affected services in the dashboard and logs. `expose` remains. Host/shared network modes are rejected. Only platform administrators can configure explicit **Published ports** exceptions per application/service. These settings cannot be supplied through ordinary Compose edits or operator resource writes. Published ports require recreate deployment.

Production attachments, fixed addresses and published-port exceptions are not inherited by previews. Preview networks and volumes remain isolated and ephemeral. Persistent production volumes survive project/application deletion.

## SSH and firewall

The SSH identity needs Docker permissions and TCP forwarding to destination container bridge subnets. Configure `AllowTcpForwarding local` (or `yes`) and include managed bridge CIDRs in `PermitOpen` restrictions where applicable; OpenSSH `PermitOpen` accepts explicit destinations, so maintain restrictions as reserved addresses change. Shipyard probes readiness through SSH to container IPs. No public backend ports are needed. Allow public 80/443 and explicitly configured TCP listeners; restrict SSH to trusted control-plane hosts. HAProxy reaches bridges from the host network. Do not expose the Docker socket publicly.

## Explicit reset

This release has no configuration migration or startup reset. Before switching an old installation, back up the control plane and run the old model's `shipyard cleanup-projects --apply` with its installation environment and durable files. This explicitly uses ownership-aware deletion jobs for projects, applications, environments, previews, routes and deployment history, then removes obsolete server preview fields. Stop on reported failures and resolve them before activating this model. Users, teams, servers, integrations, zones, unrelated workloads and persistent application volumes remain. Recreate applications using the new configuration pages.

The reset command never silently deletes rows around a failed host/DNS cleanup. PostgreSQL resources/settings, encrypted releases and reservation records are included in the existing encrypted control-plane backup.
