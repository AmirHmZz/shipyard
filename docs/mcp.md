# Shipyard MCP

Shipyard serves Streamable HTTP at `https://<dashboard-host>/mcp`. Every request requires an `Authorization: Bearer <token>` header. Use the same HTTPS hostname as the dashboard.

## Connect an agent

1. Open **Settings → MCP access** as a platform administrator.
2. Select **Create token**. Name the credential, select the projects the agent may read, and set an expiry. The default is 30 days. Copy the token when it appears and save it in the agent's secret store.
3. Configure the client with the endpoint shown in settings. For Codex, make the token available to the Codex process as `SHIPYARD_MCP_TOKEN` and register the endpoint with the following command.

   ```sh
   codex mcp add shipyard --url https://<dashboard-host>/mcp --bearer-token-env-var SHIPYARD_MCP_TOKEN
   ```

Issue one credential per agent. Use the token's action menu to manage it.

- **Edit access** updates the allowed projects immediately. The client can keep its current secret.
- **Recreate token** issues a new secret on the same record, retains the allowed projects, and starts a new lifetime. Expired and revoked records can be recreated. Any previous secret stops working immediately. Copy the new secret and update the client.
- **Revoke token** invalidates the credential and keeps its record. **Delete record** invalidates the credential and permanently removes the record.

Expired tokens remain listed until deleted. Restoring a Shipyard backup requires issuing fresh MCP tokens.

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
