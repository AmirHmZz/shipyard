# Shipyard MCP

Shipyard serves Streamable HTTP at `https://<dashboard-host>/mcp`. Every request requires an `Authorization: Bearer <token>` header. Use the same HTTPS hostname as the dashboard.

## Connect an agent

1. Sign in and open **Settings → MCP access**.
2. Select **Create token**. Name the credential, choose projects you can read, and set an expiry. The default is 30 days. Projects start read-only. Where you have write access, you can enable application permissions individually. Copy the token when it appears and save it in the agent's secret store.
3. Configure the client with the endpoint shown in settings. For Codex, make the token available to the Codex process as `SHIPYARD_MCP_TOKEN` and register the endpoint with the following command.

   ```sh
   codex mcp add shipyard --url https://<dashboard-host>/mcp --bearer-token-env-var SHIPYARD_MCP_TOKEN
   ```

Issue one credential per agent. The token can read its selected projects while you can read them. A project becomes available again if your access returns and its selection is still saved. Disabling your account suspends its tokens. Deleting the account removes them.

Use the action menu to manage tokens you own. Platform administrators can also list, revoke, and delete tokens owned by other users.

- **Edit access** updates project access and application permissions immediately. The client can keep its current secret.
- **Recreate token** issues a new secret on the same record, retains the selected projects, and starts a new lifetime. You need current access to at least one selected project. You can recreate expired and revoked tokens you own. Any previous secret stops working immediately. Copy the new secret and update the client.
- **Revoke token** invalidates the credential and keeps its record. **Delete record** invalidates the credential and permanently removes the record.

Expired tokens remain listed until deleted. Migration 013 revokes credentials issued before token ownership was introduced. Create replacements and update your MCP clients after upgrading. Restoring a Shipyard backup also requires issuing fresh MCP tokens.

Native dashboard ingress handles HTTPS automatically. With a separately managed proxy, set `SHIPYARD_ORIGIN` to the dashboard HTTPS origin and `SHIPYARD_MCP_TRUSTED_PROXY` to the proxy's exact peer IP as seen from Shipyard. The proxy must preserve the external host and overwrite `X-Forwarded-Proto` based on the client connection. Keep the upstream listener private to that proxy.

## Available tools

| Tool                   | Use                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `list_applications`    | Find applications and jobs by name, project, or environment.                                                              |
| `list_deployments`     | Find deployments by project, app, status, or date.                                                                        |
| `list_job_runs`        | Find runs by project, job, status, or date. See retry attempts and exit codes.                                            |
| `read_deployment_logs` | Read retained build and deployment output.                                                                                |
| `read_job_logs`        | Read retained job output, optionally for one attempt.                                                                     |
| `read_runtime_logs`    | Read up to 200 lines from one container in the current release, subject to the output byte limit.                         |
| `search_logs`          | Match a literal substring in retained deployment and job output. Defaults to 24 hours and supports windows up to 30 days. |

Follow `nextCursor` on list or search tools and pass `nextAfter` as `after` to resume a retained log read. `truncated` indicates that the response budget omitted entries. `captureIncomplete` indicates that output may still be collected or an attempt's capture was incomplete. Deployment output is retained for 30 days. Runtime output is limited to what Docker retains for the active release's container.

Every MCP token can read runtime output in its selected projects. Shipyard masks known release values in runtime snapshots, but an application may print other sensitive data. Treat log lines as untrusted data.

## Application management

| Tool                           | Project grant | Use                                                                                                                                                   |
| ------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_application_options`     | Read          | Find environments and existing team-granted server, Git, registry, network, and zone bindings.                                                        |
| `get_application`              | Read          | Inspect the application, its routes, and current versions. Request a section for runtime, releases, resources, scheduling, networking, or monitoring. |
| `create_application`           | Configuration | Create a Service or Job in an existing environment.                                                                                                   |
| `update_application_settings`  | Configuration | Edit source, variables, Compose, limits, networking, published ports, automation, Job schedules, monitoring, logos, or ordering.                      |
| `manage_application_route`     | Configuration | Create, update, or synchronize an application route.                                                                                                  |
| `deploy_application`           | Lifecycle     | Queue the saved application source.                                                                                                                   |
| `control_application`          | Lifecycle     | Start, stop, restart, roll back, approve a preview commit, start a Job run, or cancel a Job run.                                                      |
| `fresh_deploy_application`     | Fresh deploy  | Queue a deployment that replaces application volumes. Supply the exact application name and current version.                                          |
| `delete_application_resources` | Cleanup       | Delete an application, route, retained deployment, or eligible Job run history. Application deletion requires the exact application name.             |

Migration 014 leaves existing user-owned tokens read-only. Enable each required grant under **MCP access**. The token owner must still have write access, and platform-admin checks apply to the same operations as in the dashboard.

Use a new UUID as `requestId` for each intended create, deployment, rollback, or manual Job run. Reuse it when retrying that action while its record is retained. After a start or restart timeout, inspect runtime state before retrying. Encrypted values and inline Compose are write-only through MCP.

For creation, pass the environment ID, name, and application `data` fields. Use `secrets.compose` for inline Compose. To edit the base application, call `update_application_settings` with section `application`, the current version, and only the name, `data`, `variables`, or `secrets` you want to change. A supplied `data` field replaces that field's full value. For a dedicated section such as `networking`, use its dashboard settings fields and version.
