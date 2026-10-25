# Configuration pages and container networking

Long forms live under `/configure/{kind}/{id-or-new}`; application networking, variables and previews live in the application workspace. Cancel returns to the originating page. Navigation away from edited forms asks before discarding changes. DNS record creation/editing also has a direct URL. Short confirmations and one-time secrets remain dialogs.

Connect DNS zones from **DNS & domains → Add zone**. Select a Cloudflare/ArvanCloud connection and choose an available provider domain. Shipyard verifies that provider ID server-side and uses its canonical domain as the zone name. Already connected domains are excluded. Provider credentials are configured separately under Integrations.

Routes select a connected zone and optional subdomain/wildcard. The full hostname identifies each route; there is no separate custom route name. HTTPS and gRPC terminate TLS and always redirect HTTP; gRPC uses h2c inside Docker. TCP uses a dedicated listener with termination or passthrough. Plaintext TCP, HTTP-only routes, path routing and backend TLS settings are rejected. Compose target services come from the resolved source; discovery returns names and replica counts without interpolated secrets. Deployment checks the immutable source again.

## Readiness and preview routing

Application creation does not require a generic application port. Optional HTTP readiness checks specify a service, container port and path in application settings, for both Git and Direct Compose. Every replica must pass; private services are probed without publishing a port. Container state, Docker health checks and routed-port checks still apply. The default deadline is 120 seconds (maximum 1800), with three-second network probes and a one-second retry interval. Legacy application/release port and path settings remain readable for rollback compatibility; editing replaces them with explicit checks.

PR previews can inherit the application's HTTP/gRPC routes, use an explicit service and port, or stay private. Without eligible routes, choose an explicit target or private mode before enabling previews. Private previews do not require DNS settings. Direct Compose has no PR previews.

## Application volumes and logs

The application's **Volumes** tab shows owned named and anonymous Docker volumes across configured and retained-release servers, including attributable unused storage. It excludes external/shared volumes and bind mounts. Sizes come from Docker's usage API over the existing transport, are cached for 30 seconds, and are measured when opening or refreshing the tab. Unsupported measurements display **Unavailable** rather than zero. SSH size measurements require stream-local forwarding to the Docker daemon socket; a denied measurement leaves the volume inventory visible. No helper containers are created and no volume data is modified.

Volume identity records preserve display attribution through container/history cleanup; they never authorize deletion or Fresh deploy. Unattributable historical anonymous volumes and volumes replaced under the same name are excluded. The read-only endpoint is `GET /applications/{id}/volumes` and requires application read access.

Application deployment/container logs no longer substitute configuration values with `[redacted]`. Terminal formatting is still removed in the viewer. Deployment events use IDs to avoid replay duplicates, and repeated Compose lifecycle progress is normalized without discarding repeated diagnostics. **Clear logs** clears only the container-log viewer's current buffer, resets line numbering and keeps streaming; Docker's retained history is unchanged. Deployment logs do not offer Clear.

## Networks

HAProxy remains `haproxy:3.4-alpine` with `--network=host`. Each application with routes or explicit HTTP readiness checks receives its own managed bridge. Routed services and services with HTTP readiness checks join it; readiness-only services do not receive public routes. Each release/container, including Compose replicas, gets a distinct reserved address before startup. HAProxy uses the verified address and container port, preserving replacement/readiness/switch/drain for eligible Dockerfile applications.

Administrators create or register bridges under **Networks**, then grant them to teams. External bridges remain owned by their original operator; unregistering never deletes them from Docker. Managed networks cannot be deleted while attached, desired by an application, or referenced by retained releases. Failed jobs preserve resources and diagnostics; retrying deletion reruns ownership checks.

Configure additional attachments and per-service hostnames in the application's **Networking** tab. Changes apply on the next deployment. A fixed address must be in the network subnet, outside its dynamic allocation pool, and unused. IPv4 network/broadcast/gateway addresses are unavailable. Registered external networks need a distinct IPAM dynamic range to guarantee fixed reservations. Fixed service addresses require one container and recreate deployment. Compose controls replicas when no single fixed service address is chosen. Rollback restores exact saved settings and fails on conflicts rather than choosing another fixed IP.

In native Linux installations, administrators can use **Networks → Attach Shipyard** to connect the control plane to a ready shared bridge on **Local host**. Attach the application's service to the same network and set its network hostname in **Networking**, then use that hostname and container port in the SOCKS integration. Control-plane attachments apply immediately, are stored in the database and are restored at startup and every 15 seconds, including after system updates. Failed changes retain the requested state and show an error with a retry action; Detach cancels a pending attachment. Remote networks and application/system ingress networks cannot be selected. Shipyard's installation network is protected, and selected networks cannot be deleted or unregistered until Shipyard is detached. Compose installation files do not need editing.

Compose `ports` declarations are removed from effective deployment configuration, leaving saved YAML untouched. A notice identifies affected services in the dashboard and logs. `expose` remains. Host/shared network modes are rejected. Only platform administrators can configure explicit **Published ports** exceptions per application/service. These settings cannot be supplied through ordinary Compose edits or operator resource writes. Published ports require recreate deployment.

Production attachments, fixed addresses and published-port exceptions are not inherited by previews. Preview networks and volumes remain isolated and ephemeral. Persistent production volumes survive project/application deletion.

## SSH and firewall

The SSH identity needs Docker permissions and TCP forwarding to destination container bridge subnets. Configure `AllowTcpForwarding local` (or `yes`) and include managed bridge CIDRs in `PermitOpen` restrictions where applicable; OpenSSH `PermitOpen` accepts explicit destinations, so maintain restrictions as reserved addresses change. Shipyard probes readiness through SSH to container IPs. No public backend ports are needed. Allow public 80/443 and explicitly configured TCP listeners; restrict SSH to trusted control-plane hosts. HAProxy reaches bridges from the host network. Do not expose the Docker socket publicly.

## Explicit reset

This release has no configuration migration or startup reset. Before switching an old installation, back up the control plane and run the old model's `shipyard cleanup-projects --apply` with its installation environment and durable files. This explicitly uses ownership-aware deletion jobs for projects, applications, environments, previews, routes and deployment history, then removes obsolete server preview fields. Stop on reported failures and resolve them before activating this model. Users, teams, servers, integrations, zones, unrelated workloads and persistent application volumes remain. Recreate applications using the new configuration pages.

The reset command never silently deletes rows around a failed host/DNS cleanup. PostgreSQL resources/settings, encrypted releases and reservation records are included in the existing encrypted control-plane backup.
