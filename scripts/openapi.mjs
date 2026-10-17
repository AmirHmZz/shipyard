import { writeFile, mkdir } from "node:fs/promises";
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const str = { type: "string" },
  bool = { type: "boolean" },
  num = { type: "number" },
  obj = { type: "object", additionalProperties: true };
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
});
const schemas = {
  ServerConfiguration: object(
    {
      connection: {
        type: "string",
        enum: ["local", "ssh"],
        description:
          "Omitted means SSH. Local transport is created by Shipyard and cannot be selected through resource writes.",
      },
      daemonId: {
        type: "string",
        readOnly: true,
        description: "Verified Docker Engine identity managed by Shipyard.",
      },
      host: str,
      port: { type: "integer" },
      user: str,
      fingerprint: str,
      authMethod: { type: "string", enum: ["private_key", "password"] },
      ipv4: str,
      ipv6: str,
    },
    [],
  ),
  NetworkAttachment: object({ networkId: str, ipv4: str, ipv6: str }, [
    "networkId",
  ]),
  ServiceNetworking: object(
    {
      hostname: str,
      connections: { type: "array", items: ref("NetworkAttachment") },
    },
    ["connections"],
  ),
  PublishedPort: object({
    host: str,
    published: { type: "integer" },
    target: { type: "integer" },
    protocol: { type: "string", enum: ["tcp", "udp"] },
  }),
  ApplicationNetworking: object(
    {
      version: { type: "integer" },
      services: {
        type: "object",
        additionalProperties: ref("ServiceNetworking"),
      },
      applied: obj,
      endpoints: {
        type: "array",
        items: object({
          service: str,
          replica: { type: "integer" },
          networkId: str,
          dockerName: str,
          ipv4: str,
          ipv6: str,
          ingress: bool,
        }),
      },
      pending: bool,
    },
    ["version", "services"],
  ),
  PublishedPorts: object({
    version: { type: "integer" },
    services: {
      type: "object",
      additionalProperties: { type: "array", items: ref("PublishedPort") },
    },
  }),
  ComposeService: object({
    name: str,
    replicas: { type: "integer" },
    ignoredPorts: bool,
  }),
  NetworkInput: object(
    {
      name: str,
      dockerId: str,
      subnet: str,
      dynamicRange: str,
      enableIPv6: bool,
      ipv6Subnet: str,
      ipv6DynamicRange: str,
    },
    ["name"],
  ),
  DockerNetwork: object({
    Id: str,
    Name: str,
    Driver: str,
    EnableIPv6: bool,
    Labels: { type: "object", additionalProperties: str },
    IPAM: obj,
    Containers: obj,
  }),
  ComposeSource: object({
    yaml: { type: "string", maxLength: 1048576 },
    version: { type: "integer" },
  }),
  GiteaInstance: object({
    id: str,
    name: str,
    url: str,
    clientId: str,
    configured: bool,
  }),
  GitSetupStart: object({ connectionId: str, url: str, manifest: obj }, [
    "connectionId",
    "url",
  ]),
  GitSetupStatus: object({
    state: str,
    account: str,
    webhookUrl: str,
    signingSecretConfigured: bool,
    lastDelivery: { type: ["string", "null"], format: "date-time" },
  }),
  TelemetryConfig: object({ dsn: str, environment: str, release: str }),
  User: object({ id: str, email: str, name: str, admin: bool, totp: bool }),
  Session: object({ user: ref("User"), csrf: str, maintenance: bool }, [
    "user",
    "csrf",
  ]),
  Resource: object({
    id: str,
    kind: str,
    name: str,
    teamId: str,
    parentId: str,
    data: {
      ...obj,
      description:
        "Kind-specific configuration. Server resources use ServerConfiguration; connection and daemonId are managed by Shipyard.",
    },
    secretKeys: { type: "array", items: str },
    canWrite: bool,
    version: { type: "integer" },
    createdAt: str,
    updatedAt: str,
  }),
  ResourceInput: object(
    {
      kind: str,
      name: str,
      teamId: str,
      parentId: str,
      data: obj,
      secrets: { type: "object", additionalProperties: str },
      version: { type: "integer" },
    },
    ["kind", "name", "data"],
  ),
  Deployment: object({
    id: str,
    applicationId: str,
    state: str,
    phase: str,
    commit: str,
    error: str,
    releaseId: str,
    rollbackId: str,
    createdAt: str,
    updatedAt: str,
  }),
  DNSRecord: object(
    {
      id: str,
      type: str,
      name: str,
      content: str,
      ttl: { type: "integer" },
      proxied: bool,
      priority: { type: "integer" },
      data: {},
      extra: {},
    },
    ["type", "name", "content", "ttl", "proxied"],
  ),
  CertificateSummary: object({
    ownerType: { type: "string", enum: ["application", "dashboard"] },
    routeId: str,
    applicationId: str,
    domain: str,
    certificateDomain: str,
    status: str,
    hasCertificate: bool,
    issuer: str,
    names: { type: "array", items: str },
    validFrom: { type: ["string", "null"], format: "date-time" },
    expiresAt: { type: ["string", "null"], format: "date-time" },
    renewalAt: { type: ["string", "null"], format: "date-time" },
    serialNumber: str,
    fingerprint: str,
    authority: str,
    error: str,
  }),
  Metric: object({
    resourceId: str,
    cpu: num,
    memory: num,
    disk: num,
    online: bool,
    at: str,
    containers: {
      type: "array",
      items: object({ id: str, name: str, cpu: num, memory: num }),
    },
  }),
  Error: object({ error: str }),
  Login: object(
    { email: str, password: str, name: str, code: str, token: str },
    ["email", "password"],
  ),
};
schemas.AlertPolicy = object({
  cpu: num,
  memory: num,
  disk: num,
  sustainedSeconds: { type: "integer" },
  offlineSeconds: { type: "integer" },
});
const paths = {};
schemas.BuildInfo = object({
  version: str,
  commit: str,
  builtAt: str,
  architecture: str,
  updaterProtocol: { type: "integer" },
});
schemas.DashboardAccess = object(
  {
    version: { type: "integer" },
    enabled: bool,
    origin: str,
    candidateOrigin: str,
    domain: str,
    routeId: str,
    activeDomain: str,
    activeRouteId: str,
    acmeConfigured: bool,
    acmeEmail: str,
    status: object({
      dns: str,
      propagation: str,
      certificate: str,
      routing: str,
      error: str,
    }),
    error: str,
  },
  [
    "version",
    "enabled",
    "origin",
    "candidateOrigin",
    "domain",
    "routeId",
    "activeDomain",
    "activeRouteId",
    "acmeConfigured",
    "acmeEmail",
  ],
);
schemas.DashboardAccessInput = object(
  {
    version: { type: "integer" },
    domain: str,
    acmeEmail: str,
    acceptTos: bool,
  },
  ["version", "domain"],
);
schemas.MigrationDirection = object({
  classification: {
    type: "string",
    enum: ["non-destructive", "destructive", "unsupported"],
  },
  impact: str,
});
schemas.Migration = object({
  version: { type: "integer" },
  name: str,
  up: ref("MigrationDirection"),
  down: ref("MigrationDirection"),
  upChecksum: str,
  downChecksum: str,
});
schemas.MigrationStep = object({
  version: { type: "integer" },
  direction: str,
  checksum: str,
  classification: str,
  impact: str,
});
schemas.MigrationPlan = object({
  current: { type: "integer" },
  target: { type: "integer" },
  steps: { type: "array", items: ref("MigrationStep") },
});
schemas.ReleaseManifest = object(
  {
    format: { type: "integer" },
    version: str,
    previous: str,
    commit: str,
    builtAt: str,
    coreImage: str,
    executorImage: str,
    architectures: { type: "array", items: str },
    schema: { type: "integer" },
    updaterProtocol: { type: "integer" },
    postgresMajor: { type: "integer" },
    minimumDocker: { type: "integer" },
    minimumCompose: str,
    migrations: { type: "array", items: ref("Migration") },
    assets: { type: "object", additionalProperties: str },
    notes: str,
  },
  ["version", "previous", "schema", "coreImage", "executorImage", "migrations"],
);
schemas.VersionChangePlan = object({
  id: str,
  revision: { type: "integer" },
  current: ref("ReleaseManifest"),
  target: ref("ReleaseManifest"),
  migrations: ref("MigrationPlan"),
  destructive: bool,
  expires: str,
});
schemas.VersionChangeOperation = object(
  {
    id: str,
    actor: str,
    state: str,
    error: str,
    plan: ref("VersionChangePlan"),
    createdAt: str,
    updatedAt: str,
    backup: str,
    backupHash: str,
  },
  ["id", "state", "error", "plan", "createdAt", "updatedAt"],
);
schemas.SystemUpdates = object(
  {
    enabled: bool,
    reason: str,
    version: ref("BuildInfo"),
    installation: object({
      revision: { type: "integer" },
      release: ref("ReleaseManifest"),
    }),
    releases: { type: "array", items: ref("ReleaseManifest") },
    operation: ref("VersionChangeOperation"),
  },
  ["enabled", "version", "releases"],
);
const addresses = { type: "array", items: str, minItems: 1 };
const bindingMap = { type: "object", additionalProperties: addresses };
schemas.HAProxySettingsInput = object({
  version: { type: "integer", minimum: 0 },
  bindings: bindingMap,
});
schemas.HAProxyFrontend = object({
  id: str,
  name: str,
  protocol: str,
  applicationId: str,
  applicationName: str,
  ports: { type: "array", items: { type: "integer" } },
  addresses,
  defaultAddresses: addresses,
  useDefaults: bool,
});
schemas.HAProxySettings = object({
  version: { type: "integer" },
  bindings: bindingMap,
  lastJobId: str,
  appliedAt: { type: ["string", "null"], format: "date-time" },
  image: str,
  frontends: { type: "array", items: ref("HAProxyFrontend") },
  apply: {
    ...object({ id: str, state: str, error: str }),
    type: ["object", "null"],
  },
});
const add = (path, method, summary, response = obj, body) => {
  const parameters = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    in: "path",
    name: m[1],
    required: true,
    schema: str,
  }));
  paths[path] ??= {};
  paths[path][method] = {
    summary,
    parameters,
    responses: {
      200: {
        description: "Success",
        content: { "application/json": { schema: response } },
      },
      400: {
        description: "Invalid input",
        content: { "application/json": { schema: ref("Error") } },
      },
      401: { description: "Authentication required" },
      403: { description: "Permission denied" },
      409: { description: "Conflict" },
    },
    ...(body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: body } },
          },
        }
      : {}),
  };
};
add("/version", "get", "Product build identity", ref("BuildInfo"));
add(
  "/settings/updates",
  "get",
  "System releases and current operation",
  ref("SystemUpdates"),
);
add(
  "/settings/updates/check",
  "post",
  "Check published normal releases",
  ref("SystemUpdates"),
  object({}),
);
add(
  "/settings/updates/plan",
  "post",
  "Preview a tested version-change step",
  ref("VersionChangePlan"),
  object({ target: str }),
);
add(
  "/settings/updates",
  "post",
  "Request an administrator-approved version change",
  ref("VersionChangeOperation"),
  object(
    {
      planId: str,
      passphrase: { type: "string", writeOnly: true, minLength: 12 },
      confirmation: str,
      approveDataLoss: bool,
    },
    ["planId", "passphrase"],
  ),
);
add(
  "/settings/updates/{id}",
  "get",
  "Version-change operation",
  ref("VersionChangeOperation"),
);
add(
  "/settings/updates/{id}/backup",
  "get",
  "Download encrypted version-change backup",
);
paths["/settings/updates/{id}/backup"].get.responses[200].content = {
  "application/octet-stream": { schema: { type: "string", format: "binary" } },
};
add(
  "/settings/dashboard-access",
  "get",
  "Administrator dashboard ingress status",
  ref("DashboardAccess"),
);
add(
  "/settings/dashboard-access",
  "put",
  "Configure dashboard hostname with manual DNS and HTTP-01 HTTPS",
  object({ jobId: str }),
  ref("DashboardAccessInput"),
);
add(
  "/settings/dashboard-access/retry",
  "post",
  "Retry dashboard HTTPS setup",
  object({ jobId: str }),
  object(
    {
      version: { type: "integer" },
    },
    ["version"],
  ),
);

for (const [path, method] of [
  ["/settings/updates", "post"],
  ["/settings/dashboard-access", "put"],
  ["/settings/dashboard-access/retry", "post"],
]) {
  paths[path][method].responses[202] = paths[path][method].responses[200];
  delete paths[path][method].responses[200];
}
add("/servers/{id}/networks", "get", "Administrator Docker network inventory", {
  type: "array",
  items: ref("DockerNetwork"),
});
add(
  "/servers/{id}/networks",
  "post",
  "Create managed bridge or register external bridge",
  ref("Resource"),
  ref("NetworkInput"),
);
paths["/servers/{id}/networks"].post.responses[202] =
  paths["/servers/{id}/networks"].post.responses[200];
delete paths["/servers/{id}/networks"].post.responses[200];
add(
  "/applications/{id}/services",
  "get",
  "Resolve service names and ignored port declarations without returning secrets",
  { type: "array", items: ref("ComposeService") },
);
add(
  "/applications/{id}/networking",
  "get",
  "Desired and applied application networking",
  ref("ApplicationNetworking"),
);
add(
  "/applications/{id}/networking",
  "put",
  "Save networking for the next deployment",
  ref("Resource"),
  ref("ApplicationNetworking"),
);
add(
  "/applications/{id}/published-ports",
  "get",
  "Administrator published port exceptions",
  ref("PublishedPorts"),
);
add(
  "/applications/{id}/published-ports",
  "put",
  "Administrator-only host-port configuration",
  ref("Resource"),
  ref("PublishedPorts"),
);
const array = (s) => ({ type: "array", items: s });
add("/auth/status", "get", "Installation status");
add(
  "/applications/{id}/compose",
  "get",
  "Operator-only saved Direct Compose YAML",
  ref("ComposeSource"),
);
add(
  "/applications/{id}/compose",
  "put",
  "Save encrypted Direct Compose YAML for the next deployment",
  ref("ComposeSource"),
  ref("ComposeSource"),
);
add(
  "/git/setup/config",
  "get",
  "Administrator Git callback configuration",
  object({ origin: str, giteaCallback: str }),
);
add(
  "/git/setup/start",
  "post",
  "Start guided Git connection",
  ref("GitSetupStart"),
  object(
    {
      name: str,
      provider: { enum: ["github", "gitea"] },
      owner: str,
      instanceId: str,
    },
    ["name", "provider"],
  ),
);
add(
  "/git/gitea/instances",
  "get",
  "List configured Gitea OAuth instances",
  array(ref("GiteaInstance")),
);
add(
  "/git/gitea/instances",
  "put",
  "Save Gitea OAuth instance credentials",
  ref("GiteaInstance"),
  object({ id: str, name: str, url: str, clientId: str, clientSecret: str }, [
    "name",
    "url",
    "clientId",
  ]),
);
add(
  "/git/{id}/setup",
  "get",
  "Git authorization and accepted webhook delivery status",
  ref("GitSetupStatus"),
);
add(
  "/git/{id}/reconnect",
  "post",
  "Reconnect Gitea OAuth or resume a GitHub App installation",
  ref("GitSetupStart"),
  obj,
);
add(
  "/git/{id}/webhook-secret",
  "post",
  "Replace Gitea signing secret and reveal it once",
  object({ secret: str }),
  obj,
);
for (const path of [
  "/git/setup/{provider}/callback",
  "/git/setup/github/install",
]) {
  add(path, "get", "Session-bound single-use provider callback");
  paths[path].get.responses = {
    303: { description: "Continue authorization or return to integrations" },
    400: { description: "Invalid callback" },
  };
  paths[path].get.parameters = (paths[path].get.parameters || []).concat(
    ["state", "code", "installation_id"].map((name) => ({
      name,
      in: "query",
      schema: str,
    })),
  );
}
add(
  "/telemetry",
  "get",
  "Public browser error reporting configuration",
  ref("TelemetryConfig"),
);
for (const action of ["setup", "login", "accept"])
  add(`/auth/${action}`, "post", action, ref("Session"), ref("Login"));
add("/auth/me", "get", "Current user and CSRF token", ref("Session"));
add("/auth/logout", "post", "End session", obj, obj);
add(
  "/auth/password",
  "post",
  "Change password and revoke other sessions",
  ref("Session"),
  object({ current: str, password: str, code: str }, ["current", "password"]),
);
add("/users", "get", "Platform users", array(obj));
add(
  "/users/{id}",
  "put",
  "Change user administrator or disabled status",
  obj,
  object({ admin: bool, disabled: bool }),
);
for (const action of ["start", "confirm", "disable"])
  add(`/auth/totp/${action}`, "post", `TOTP ${action}`, obj, obj);
add("/resources", "get", "List authorized resources", array(ref("Resource")));
add(
  "/resources",
  "post",
  "Create resource",
  ref("Resource"),
  ref("ResourceInput"),
);
add("/resources/{id}", "get", "Get resource", ref("Resource"));
add(
  "/resources/{id}",
  "put",
  "Update resource with optimistic version check",
  ref("Resource"),
  ref("ResourceInput"),
);
add(
  "/resources/{id}",
  "delete",
  "Delete unused infrastructure, or queue project/application cleanup with persistent volumes preserved",
  obj,
  obj,
);
paths["/resources/{id}"].delete.responses[202] = {
  description:
    "Project/application deletion queued; resources expose deleting, deletionRoot and deletionError until cleanup completes",
  content: { "application/json": { schema: object({ ok: bool, jobId: str }) } },
};
add("/resources/{id}/grants", "get", "List infrastructure grants", array(str));
add(
  "/resources/{id}/grants",
  "post",
  "Grant infrastructure to a team",
  obj,
  object({ teamId: str, granted: bool }),
);
add(
  "/servers/fingerprint",
  "post",
  "Probe an SSH host key without authenticating",
  obj,
  object({ host: str, port: num }),
);
for (const action of ["provision", "test"])
  add(`/servers/{id}/${action}`, "post", action, obj, obj);
add(
  "/servers/{id}/metrics",
  "get",
  "Server and container metric history",
  array(ref("Metric")),
);
add(
  "/git/{id}/repositories",
  "get",
  "Accessible provider repositories",
  array(obj),
);
add("/git/{id}/branches", "get", "Repository branches", array(obj));
paths["/git/{id}/branches"].get.parameters.push({
  name: "repository",
  in: "query",
  required: true,
  schema: str,
});
add("/dns/{id}/zones", "get", "Provider zones", array(obj));
add(
  "/servers/{id}/haproxy",
  "get",
  "Administrator HAProxy frontend bind settings and apply status",
  ref("HAProxySettings"),
);
add(
  "/servers/{id}/haproxy",
  "put",
  "Queue validated frontend binding changes",
  object({ jobId: str }),
  ref("HAProxySettingsInput"),
);
paths["/servers/{id}/haproxy"].put.responses[202] =
  paths["/servers/{id}/haproxy"].put.responses[200];
delete paths["/servers/{id}/haproxy"].put.responses[200];
add("/zones/{id}/records", "get", "DNS records", array(ref("DNSRecord")));
add(
  "/zones/{id}/certificates",
  "get",
  "Public certificate metadata for accessible applications in a DNS zone",
  array(ref("CertificateSummary")),
);
add(
  "/zones/{id}/records",
  "post",
  "Create DNS record",
  ref("DNSRecord"),
  ref("DNSRecord"),
);
add(
  "/zones/{id}/records/{record}",
  "put",
  "Update DNS record",
  ref("DNSRecord"),
  ref("DNSRecord"),
);
add("/zones/{id}/records/{record}", "delete", "Delete DNS record", obj, obj);
add(
  "/routes/{id}/status",
  "get",
  "DNS, propagation, certificate and route status",
);
add(
  "/routes/{id}/sync",
  "post",
  "Reconcile route DNS and certificate",
  obj,
  obj,
);
add(
  "/applications/{id}/runtime",
  "get",
  "Active release, containers and ports",
);
for (const action of ["deploy", "rollback", "action", "approve-preview"])
  add(
    `/applications/{id}/${action}`,
    "post",
    action,
    action === "deploy" || action === "rollback" ? ref("Deployment") : obj,
    action === "deploy"
      ? object(
          {
            ref: str,
            version: {
              type: "integer",
              description:
                "Optional application revision; stale values return 409",
            },
          },
          [],
        )
      : obj,
  );
add("/applications/{id}/releases", "get", "Retained releases", array(obj));
add(
  "/applications/{id}/metrics",
  "get",
  "Application-scoped container metric history",
  array(ref("Metric")),
);
for (const path of ["/applications/{id}/logs", "/deployments/{id}/events"]) {
  add(path, "get", "Server-sent event stream");
  paths[path].get.responses[200].content = {
    "text/event-stream": { schema: str },
  };
}
add(
  "/applications/{id}/terminal",
  "get",
  "Authenticated container terminal WebSocket",
);
paths["/applications/{id}/terminal"].get.responses = {
  101: { description: "WebSocket upgrade" },
};
add(
  "/deployments",
  "get",
  "Authorized deployment history",
  array(ref("Deployment")),
);
add("/deployments/{id}", "get", "Deployment status", ref("Deployment"));
add("/teams/{id}/members", "get", "Team members", array(obj));
add("/teams/{id}/invitations", "post", "Create invitation link", obj, obj);
add("/projects/{id}/members", "post", "Assign project role", obj, obj);
add("/teams/{id}/members/{user}", "delete", "Remove team member", obj, obj);
for (const path of ["/audit", "/jobs"])
  add(path, "get", path.slice(1), array(obj));
add(
  "/settings/maintenance",
  "post",
  "Set maintenance mode",
  obj,
  object({ enabled: bool }),
);
add(
  "/settings/alerts",
  "get",
  "Resource alert thresholds and durations",
  ref("AlertPolicy"),
);
add(
  "/settings/alerts",
  "put",
  "Update alert policy",
  ref("AlertPolicy"),
  ref("AlertPolicy"),
);
add(
  "/backup",
  "post",
  "Export passphrase-encrypted backup",
  str,
  object({ passphrase: str }),
);
paths["/backup"].post.responses[200].content = {
  "application/octet-stream": { schema: { type: "string", format: "binary" } },
};
add("/hooks/{id}", "post", "Receive signed GitHub/Gitea webhook", obj, obj);
const publicPaths = new Set([
  "/telemetry",
  "/auth/status",
  "/auth/setup",
  "/auth/login",
  "/auth/accept",
  "/hooks/{id}",
]);
for (const [path, operations] of Object.entries(paths)) {
  for (const [method, operation] of Object.entries(operations)) {
    if (publicPaths.has(path)) operation.security = [];
    else if (["post", "put", "delete"].includes(method))
      operation.security = [{ session: [], csrf: [] }];
    operation.responses[404] = { description: "Resource not found" };
    operation.responses[503] = {
      description: "Maintenance mode or dependency unavailable",
    };
  }
}
for (const path of [
  "/servers/{id}/provision",
  "/routes/{id}/sync",
  "/applications/{id}/deploy",
  "/applications/{id}/rollback",
  "/applications/{id}/approve-preview",
  "/hooks/{id}",
]) {
  paths[path].post.responses[202] = paths[path].post.responses[200];
  delete paths[path].post.responses[200];
}
paths["/teams/{id}/invitations"].post.responses[201] =
  paths["/teams/{id}/invitations"].post.responses[200];
delete paths["/teams/{id}/invitations"].post.responses[200];
paths["/applications/{id}/terminal"].get.parameters.push(
  ...["container", "csrf"].map((name) => ({
    in: "query",
    name,
    required: true,
    schema: str,
  })),
);
await mkdir("api", { recursive: true });
await writeFile(
  "api/openapi.yaml",
  JSON.stringify(
    {
      openapi: "3.0.3",
      info: {
        title: "Shipyard API",
        version: "0.1.0",
        description:
          "Cookie sessions; mutations require X-CSRF-Token. Resource data is validated by kind. Secrets are write-only.",
      },
      servers: [{ url: "/api/v1" }],
      paths,
      components: {
        schemas,
        securitySchemes: {
          session: { type: "apiKey", in: "cookie", name: "shipyard_session" },
          csrf: { type: "apiKey", in: "header", name: "X-CSRF-Token" },
        },
      },
      security: [{ session: [] }],
    },
    null,
    2,
  ) + "\n",
);
