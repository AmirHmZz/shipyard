import { writeFile, mkdir } from "node:fs/promises";
function ref(name) {
  return { $ref: `#/components/schemas/${name}` };
}
const str = { type: "string" },
  bool = { type: "boolean" },
  num = { type: "number" },
  obj = { type: "object", additionalProperties: true };
function object(properties, required = Object.keys(properties)) {
  return {
    type: "object",
    properties,
    required,
  };
}
function nullable(schema) {
  return { ...schema, nullable: true };
}
function input(properties, required = Object.keys(properties)) {
  return { ...object(properties, required), additionalProperties: false };
}
const schemas = {
  ControlPlaneNetwork: object({
    networkId: str,
    desired: bool,
    attached: bool,
    error: str,
  }),
  ControlPlaneNetworks: object({
    available: bool,
    networks: { type: "array", items: ref("ControlPlaneNetwork") },
  }),
  JobSettings: object({
    version: { type: "integer", minimum: 0 },
    enabled: bool,
    cron: str,
    timezone: str,
    timeoutSeconds: { type: "integer", minimum: 60, maximum: 86400 },
    retries: { type: "integer", minimum: 0, maximum: 5 },
    retryDelaySeconds: { type: "integer", minimum: 1, maximum: 3600 },
    nextDue: nullable(str),
    upcoming: { type: "array", items: str },
  }),
  JobSettingsInput: input(
    {
      version: { type: "integer", minimum: 0 },
      enabled: bool,
      cron: str,
      timezone: str,
      timeoutSeconds: { type: "integer", minimum: 60, maximum: 86400 },
      retries: { type: "integer", minimum: 0, maximum: 5 },
      retryDelaySeconds: { type: "integer", minimum: 1, maximum: 3600 },
      nextDue: nullable(str),
      upcoming: { type: "array", items: str },
    },
    [
      "version",
      "enabled",
      "cron",
      "timezone",
      "timeoutSeconds",
      "retries",
      "retryDelaySeconds",
    ],
  ),
  JobAttempt: object({
    number: num,
    container: str,
    state: str,
    startedAt: nullable(str),
    deadline: nullable(str),
    finishedAt: nullable(str),
    exitCode: nullable(num),
    logBytes: num,
    logLines: num,
    logsComplete: bool,
    cleaned: bool,
  }),
  JobRun: object({
    id: str,
    applicationId: str,
    releaseId: str,
    state: {
      type: "string",
      enum: [
        "queued",
        "running",
        "retry_wait",
        "cancelling",
        "succeeded",
        "failed",
        "timed_out",
        "cancelled",
        "skipped",
      ],
    },
    trigger: str,
    actor: str,
    policy: ref("JobSettings"),
    createdAt: str,
    finishedAt: nullable(str),
    retryAt: nullable(str),
    error: str,
    cleanupPending: bool,
    attempts: { type: "array", items: ref("JobAttempt") },
  }),
  JobRunPage: object({
    items: { type: "array", items: ref("JobRun") },
    nextCursor: str,
    activeRun: nullable(ref("JobRun")),
  }),
  JobRunEvent: object({
    id: num,
    runId: str,
    attempt: num,
    message: str,
    createdAt: str,
  }),
  Ok: object({ ok: bool }),
  Queued: object({ queued: bool }),
  Accepted: object({ accepted: bool }),
  DeletionResult: object({ ok: bool, jobId: str }, ["ok"]),
  SetupStatus: object({ setupRequired: bool, setupEnabled: bool }),
  FingerprintResult: object({ fingerprint: str }),
  DockerVersionResult: object(
    { dockerVersion: str, status: str, connection: str },
    ["dockerVersion"],
  ),
  ProviderZone: object({ id: str, name: str }),
  RepositoryOption: object({ full_name: str }),
  BranchOption: object({ name: str }),
  TeamMember: object({ id: str, email: str, name: str, role: str }),
  InvitationResult: object({ url: str }),
  TOTPStart: object({ secret: str, url: str }),
  TOTPRecovery: object({ recoveryCodes: { type: "array", items: str } }),
  DomainRecord: object({
    id: str,
    type: str,
    name: str,
    content: str,
    owned: bool,
  }),
  DomainSync: object({
    id: str,
    state: str,
    attempts: { type: "integer" },
    error: str,
  }),
  DomainState: object(
    {
      routeId: str,
      domain: str,
      dns: str,
      propagation: str,
      certificate: str,
      routing: str,
      error: str,
      expiresAt: nullable({ type: "string", format: "date-time" }),
      records: { type: "array", items: ref("DomainRecord") },
      sync: ref("DomainSync"),
    },
    [
      "routeId",
      "domain",
      "dns",
      "propagation",
      "certificate",
      "routing",
      "error",
      "expiresAt",
      "records",
    ],
  ),
  RuntimeTarget: object({
    service: str,
    container: str,
    port: { type: "integer" },
    address: str,
    networkId: str,
  }),
  ApplicationRelease: object({
    id: str,
    commit: str,
    createdAt: str,
    images: nullable({ type: "object", additionalProperties: str }),
  }),
  AuditEntry: object({
    id: { type: "integer" },
    userId: str,
    action: str,
    resourceId: str,
    teamId: str,
    at: str,
  }),
  Job: object({
    id: str,
    kind: str,
    resourceId: str,
    state: str,
    attempts: { type: "integer" },
    error: str,
    createdAt: str,
  }),
  RegistryConfiguration: object({
    hostname: {
      type: "string",
      description:
        "Registry hostname and optional port, without scheme or image path. Docker Hub aliases normalize to docker.io.",
    },
    username: str,
  }),
  ApplicationRuntime: object(
    {
      status: str,
      error: str,
      releaseId: str,
      commit: str,
      containers: nullable({ type: "array", items: str }),
      targets: nullable({ type: "array", items: ref("RuntimeTarget") }),
      createdAt: str,
    },
    ["status"],
  ),
  HTTPReadinessCheck: object({
    service: str,
    port: { type: "integer", minimum: 1, maximum: 65535 },
    path: { type: "string", pattern: "^/" },
  }),
  PreviewRouting: object(
    {
      mode: { type: "string", enum: ["inherit", "target", "private"] },
      service: str,
      port: { type: "integer", minimum: 1, maximum: 65535 },
    },
    ["mode"],
  ),
  ApplicationChecks: object(
    {
      composeMode: {
        type: "string",
        enum: ["repository", "inline"],
        description:
          "Git Compose document source. Omitted means repository. Inline YAML is encrypted in secrets.compose and edited through /applications/{id}/compose.",
      },
      workload: {
        type: "string",
        enum: ["service", "job"],
        description:
          "Immutable application workload. Omitted values mean service.",
      },
      jobService: {
        type: "string",
        description:
          "Deployed target service for Compose Jobs. Dependencies are not started.",
      },
      readinessChecks: nullable({
        type: "array",
        items: ref("HTTPReadinessCheck"),
        description:
          "Null or omitted preserves legacy HTTP readiness; an empty array disables HTTP probes.",
      }),
      readinessMode: {
        type: "string",
        enum: ["container", "checks"],
        description:
          "New applications default to container. Omitted on existing applications or retained releases preserves checked readiness.",
      },
      previewRouting: ref("PreviewRouting"),
      healthTimeout: { type: "integer" },
    },
    [],
  ),
  VolumeMount: object({ service: str, container: str, path: str }),
  ApplicationVolume: object({
    name: str,
    serverId: str,
    serverName: str,
    type: { type: "string", enum: ["named", "anonymous"] },
    driver: str,
    createdAt: str,
    mounts: { type: "array", items: ref("VolumeMount") },
    inUse: bool,
    sizeBytes: nullable({ type: "integer", minimum: 0 }),
    measuredAt: nullable({ type: "string", format: "date-time" }),
  }),
  ApplicationVolumes: object({
    volumes: { type: "array", items: ref("ApplicationVolume") },
    errors: { type: "array", items: object({ serverId: str, error: str }) },
  }),

  DeletionItem: object({ kind: str, id: str, name: str, reason: str }),
  ServerDeletionPlan: object({
    id: str,
    serverId: str,
    serverName: str,
    daemonId: str,
    expiresAt: { type: "string", format: "date-time" },
    remove: { type: "array", items: ref("DeletionItem") },
    preserve: { type: "array", items: ref("DeletionItem") },
    blockers: { type: "array", items: str },
  }),
  ServerDeletionInput: object({ planId: str, name: str, deleteVolumes: bool }),
  ServerDeletionStatus: object({
    plan: ref("ServerDeletionPlan"),
    stage: str,
    error: str,
    jobId: str,
    done: bool,
  }),
  DeletionConnectionInput: object(
    {
      host: str,
      port: num,
      user: str,
      fingerprint: str,
      authMethod: { type: "string", enum: ["private_key", "password"] },
      secrets: { type: "object", additionalProperties: str },
    },
    ["host", "port", "user", "fingerprint", "authMethod"],
  ),
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
      connections: nullable({ type: "array", items: ref("NetworkAttachment") }),
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
      applied: {
        type: "object",
        additionalProperties: ref("ServiceNetworking"),
      },
      endpoints: nullable({
        type: "array",
        items: object(
          {
            service: str,
            replica: { type: "integer" },
            networkId: str,
            dockerName: str,
            ipv4: str,
            ipv6: str,
            ingress: bool,
          },
          ["service", "replica", "networkId", "dockerName", "ingress"],
        ),
      }),
      pending: bool,
    },
    ["version", "services", "applied", "endpoints", "pending"],
  ),
  PublishedPorts: object({
    version: { type: "integer" },
    services: nullable({
      type: "object",
      additionalProperties: { type: "array", items: ref("PublishedPort") },
    }),
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
    Labels: nullable({ type: "object", additionalProperties: str }),
    IPAM: obj,
    Containers: nullable(obj),
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
    lastDelivery: nullable({ type: "string", format: "date-time" }),
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
        "Kind-specific configuration. Registry resources use RegistryConfiguration and encrypted secrets.password, with administrator-managed team grants and automatic image authentication. Application readiness and preview settings use ApplicationChecks. Server resources use ServerConfiguration; connection and daemonId are managed by Shipyard.",
    },
    secretKeys: { type: "array", items: str },
    variables: { type: "object", additionalProperties: str },
    canWrite: bool,
    version: { type: "integer" },
    createdAt: str,
    updatedAt: str,
  }),
  ResourceInput: object(
    {
      kind: str,
      name: {
        type: "string",
        description:
          "Required except for routes, whose display name is derived from data.domain.",
      },
      teamId: str,
      parentId: str,
      data: obj,
      secrets: { type: "object", additionalProperties: str },
      variables: {
        type: "object",
        additionalProperties: nullable(str),
        description:
          "Scoped runtime values. Omitted keys are unchanged; null deletes a value. Secrets must be supplied through secrets.",
      },
      version: { type: "integer" },
    },
    ["kind", "data"],
  ),
  Deployment: object(
    {
      id: str,
      applicationId: str,
      state: {
        type: "string",
        description:
          "Deployment state, including terminal healthy, failed, recovery_failed and cancelled.",
      },
      phase: str,
      commit: str,
      error: str,
      releaseId: str,
      rollbackId: str,
      createdAt: str,
      updatedAt: str,
      deleting: bool,
      deletionError: str,
    },
    [
      "id",
      "applicationId",
      "state",
      "phase",
      "commit",
      "error",
      "releaseId",
      "rollbackId",
      "createdAt",
      "updatedAt",
    ],
  ),
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
    validFrom: nullable({ type: "string", format: "date-time" }),
    expiresAt: nullable({ type: "string", format: "date-time" }),
    renewalAt: nullable({ type: "string", format: "date-time" }),
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
schemas.IORate = object({
  name: str,
  read: nullable(num),
  write: nullable(num),
});
Object.assign(schemas.Metric.properties, {
  status: str,
  valid: bool,
  cpuValid: bool,
  memoryBytes: num,
  memoryTotalBytes: num,
  network: array(ref("IORate")),
  devices: array(ref("IORate")),
  networkRx: nullable(num),
  networkTx: nullable(num),
  diskRead: nullable(num),
  diskWrite: nullable(num),
  peakCpu: num,
  peakMemory: num,
  peakDisk: num,
  availability: num,
  samples: num,
});
Object.assign(schemas.Metric.properties.containers.items.properties, {
  valid: bool,
  cpuValid: bool,
  memoryBytes: num,
  networkRx: nullable(num),
  networkTx: nullable(num),
  diskRead: nullable(num),
  diskWrite: nullable(num),
});
schemas.CertificateNetwork = input({ proxyId: str });
schemas.MonitoringPolicy = input({
  ...schemas.AlertPolicy.properties,
  enabled: bool,
  destinations: array(str),
});
schemas.MonitoringDefaults = input({
  server: ref("MonitoringPolicy"),
  application: ref("MonitoringPolicy"),
});
schemas.MonitoringPolicyState = input({
  mode: { type: "string", enum: ["inherit", "override", "disabled"] },
  policy: ref("MonitoringPolicy"),
});
schemas.MonitoringResource = object({
  id: str,
  kind: { type: "string", enum: ["server", "application"] },
  name: str,
  serverId: str,
  status: str,
  latest: nullable(schemas.Metric),
});
schemas.MonitoringIncident = object({
  id: str,
  resourceId: str,
  kind: str,
  state: { type: "string", enum: ["pending", "firing", "resolved"] },
  since: str,
  firedAt: nullable(str),
  resolvedAt: nullable(str),
  destinations: array(str),
  data: ref("Metric"),
});
schemas.NotificationDelivery = object({
  state: str,
  error: str,
  at: nullable(str),
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
    status: ref("DomainState"),
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
    releases: nullable({ type: "array", items: ref("ReleaseManifest") }),
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
  appliedAt: nullable({ type: "string", format: "date-time" }),
  image: str,
  frontends: { type: "array", items: ref("HAProxyFrontend") },
  apply: nullable(object({ id: str, state: str, error: str })),
});
schemas.UserAccess = object({ ...schemas.User.properties, disabled: bool });
schemas.NetworkingInput = input(
  {
    version: { type: "integer" },
    services: nullable({
      type: "object",
      additionalProperties: ref("ServiceNetworking"),
    }),
  },
  ["version"],
);
schemas.PublishedPortsInput = input(schemas.PublishedPorts.properties, [
  "version",
]);
schemas.DNSRecordInput = input(
  { ...schemas.DNSRecord.properties, priority: nullable({ type: "integer" }) },
  ["type", "name"],
);
schemas.AlertPolicyInput = input(schemas.AlertPolicy.properties);
schemas.SetupInput = input(schemas.Login.properties, [
  "email",
  "password",
  "name",
  "token",
]);
schemas.LoginInput = input(schemas.Login.properties, ["email", "password"]);
schemas.AcceptInvitationInput = input(schemas.Login.properties, [
  "password",
  "token",
]);
schemas.AcceptInvitationInput.description =
  "Email is taken from the invitation. Name is required when creating a new account; existing accounts use their password and optional authenticator code.";
schemas.TOTPStartInput = input(schemas.Login.properties, ["password"]);
schemas.TOTPConfirmInput = input(schemas.Login.properties, ["code"]);
schemas.TOTPDisableInput = input(schemas.Login.properties, [
  "password",
  "code",
]);
function add(path, method, summary, response = obj, body) {
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
}
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
  "/settings/control-plane-networks",
  "get",
  "Administrator control-plane network attachments",
  ref("ControlPlaneNetworks"),
);
add(
  "/networks/{id}/control-plane",
  "put",
  "Persist and apply a control-plane attachment to a local shared bridge",
  ref("ControlPlaneNetwork"),
  input({ attached: bool }),
);
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
  "/applications/{id}/volumes",
  "get",
  "Read-only owned application volumes and measured Docker usage",
  ref("ApplicationVolumes"),
);
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
  ref("NetworkingInput"),
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
  ref("PublishedPortsInput"),
);
function array(s) {
  return { type: "array", items: s };
}
add("/auth/status", "get", "Installation status", ref("SetupStatus"));
add(
  "/applications/{id}/compose",
  "get",
  "Operator-only saved inline Compose YAML (standalone or Git checkout)",
  ref("ComposeSource"),
);
add(
  "/applications/{id}/compose",
  "put",
  "Save encrypted inline Compose YAML for the next deployment",
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
);
add(
  "/git/{id}/webhook-secret",
  "post",
  "Replace Gitea signing secret and reveal it once",
  object({ secret: str }),
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
for (const [action, schema] of [
  ["setup", "SetupInput"],
  ["login", "LoginInput"],
  ["accept", "AcceptInvitationInput"],
])
  add(`/auth/${action}`, "post", action, ref("Session"), ref(schema));
add("/auth/me", "get", "Current user and CSRF token", ref("Session"));
add("/auth/logout", "post", "End session", ref("Ok"));
add(
  "/auth/password",
  "post",
  "Change password and revoke other sessions",
  ref("Session"),
  object({ current: str, password: str, code: str }, ["current", "password"]),
);
add("/users", "get", "Platform users", array(ref("UserAccess")));
add(
  "/users/{id}",
  "put",
  "Change user administrator or disabled status",
  ref("Ok"),
  object({ admin: bool, disabled: bool }),
);
for (const [action, response, body] of [
  ["start", "TOTPStart", "TOTPStartInput"],
  ["confirm", "TOTPRecovery", "TOTPConfirmInput"],
  ["disable", "Ok", "TOTPDisableInput"],
])
  add(
    `/auth/totp/${action}`,
    "post",
    `TOTP ${action}`,
    ref(response),
    ref(body),
  );
add("/resources", "get", "List authorized resources", array(ref("Resource")));
add(
  "/resources",
  "post",
  "Create resource",
  ref("Resource"),
  ref("ResourceInput"),
);
schemas.ResourceUpdateInput = {
  ...schemas.ResourceInput,
  required: ["data"],
};
add("/resources/{id}", "get", "Get resource", ref("Resource"));
add(
  "/resources/{id}",
  "put",
  "Update resource with optimistic version check",
  ref("Resource"),
  ref("ResourceUpdateInput"),
);
add(
  "/resources/{id}",
  "delete",
  "Delete infrastructure or queue cleanup. Servers require ServerDeletionInput and remove owned application volumes; project/application deletion preserves volumes",
  ref("DeletionResult"),
);
paths["/resources/{id}"].delete.responses[202] = {
  description:
    "Project/application deletion queued; resources expose deleting, deletionRoot and deletionError until cleanup completes",
  content: { "application/json": { schema: ref("DeletionResult") } },
};
add("/resources/{id}/grants", "get", "List infrastructure grants", array(str));
add(
  "/resources/{id}/grants",
  "post",
  "Grant infrastructure to a team",
  ref("Ok"),
  object({ teamId: str, granted: bool }),
);
add(
  "/servers/fingerprint",
  "post",
  "Probe an SSH host key without authenticating",
  ref("FingerprintResult"),
  object({ host: str, port: num }),
);
for (const action of ["provision", "test"])
  add(
    `/servers/{id}/${action}`,
    "post",
    action,
    ref(action === "provision" ? "Queued" : "DockerVersionResult"),
  );
add(
  "/servers/{id}/deletion-plan",
  "post",
  "Administrator review of remote-server cleanup; no host changes",
  ref("ServerDeletionPlan"),
);
add(
  "/servers/{id}",
  "delete",
  "Administrator cleanup using a reviewed plan, exact name and permanent volume acknowledgement",
  object({ ok: bool, jobId: str }),
  ref("ServerDeletionInput"),
);
add(
  "/servers/{id}/deletion",
  "get",
  "Administrator cleanup progress, including completed operations",
  ref("ServerDeletionStatus"),
);
add(
  "/servers/{id}/deletion/retry",
  "post",
  "Resume the approved cleanup after a failure",
  object({ jobId: str }),
);
add(
  "/servers/{id}/deletion/connection",
  "put",
  "Repair SSH access after a cleanup failure; verifies the approved Docker daemon",
  object({ ok: bool }),
  ref("DeletionConnectionInput"),
);
for (const [path, method] of [
  ["/servers/{id}", "delete"],
  ["/servers/{id}/deletion/retry", "post"],
]) {
  paths[path][method].responses[202] = paths[path][method].responses[200];
  delete paths[path][method].responses[200];
}
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
  array(ref("RepositoryOption")),
);
add(
  "/git/{id}/branches",
  "get",
  "Repository branches",
  array(ref("BranchOption")),
);
paths["/git/{id}/branches"].get.parameters.push({
  name: "repository",
  in: "query",
  required: true,
  schema: str,
});
add(
  "/dns/test",
  "post",
  "Test unsaved DNS provider credentials",
  object({ ok: bool }),
  object({
    provider: { type: "string", enum: ["cloudflare", "arvancloud"] },
    token: str,
  }),
);
add("/dns/{id}/zones", "get", "Provider zones", array(ref("ProviderZone")));
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
  ref("DNSRecordInput"),
);
add(
  "/zones/{id}/records/{record}",
  "put",
  "Update DNS record",
  ref("DNSRecord"),
  ref("DNSRecordInput"),
);
add("/zones/{id}/records/{record}", "delete", "Delete DNS record", ref("Ok"));
add(
  "/routes/{id}/status",
  "get",
  "DNS, propagation, certificate and route status",
  ref("DomainState"),
);
add(
  "/routes/{id}/sync",
  "post",
  "Reconcile route DNS and certificate",
  ref("Queued"),
  input({ mode: { type: "string", enum: ["", "adopt", "replace"] } }, []),
);
add(
  "/applications/{id}/runtime",
  "get",
  "Application status, including stopping/stopped/stop_failed without an active release",
  ref("ApplicationRuntime"),
);
add(
  "/applications/{id}/job-settings",
  "get",
  "Job policy and schedule; optional cron/timezone query previews occurrences",
  ref("JobSettings"),
);
add(
  "/applications/{id}/job-settings",
  "put",
  "Save Job policy with optimistic version checks",
  ref("JobSettings"),
  ref("JobSettingsInput"),
);
add(
  "/applications/{id}/runs",
  "get",
  "Paginated Job execution history",
  ref("JobRunPage"),
);
add(
  "/applications/{id}/runs",
  "post",
  "Run the latest prepared Job release",
  ref("JobRun"),
  input({ idempotencyKey: str }, []),
);
paths["/applications/{id}/runs"].post.responses[202] =
  paths["/applications/{id}/runs"].post.responses[200];
delete paths["/applications/{id}/runs"].post.responses[200];
add(
  "/applications/{id}/runs/{runId}",
  "get",
  "Job execution and attempt details",
  ref("JobRun"),
);
add(
  "/applications/{id}/runs/{runId}/cancel",
  "post",
  "Idempotently cancel a Job execution",
  ref("JobRun"),
);
add(
  "/applications/{id}/runs/{runId}/events",
  "get",
  "Replayable SSE Job log and status events",
  ref("JobRunEvent"),
);
paths["/applications/{id}/runs/{runId}/events"].get.responses[200] = {
  description:
    "SSE log events carry JobRunEvent; status events carry JobRun. Last-Event-ID resumes logs.",
  content: { "text/event-stream": { schema: str } },
};
for (const [path, name] of [
  ["/applications/{id}/runs", "before"],
  ["/applications/{id}/job-settings", "cron"],
  ["/applications/{id}/job-settings", "timezone"],
  ["/applications/{id}/runs/{runId}/events", "after"],
])
  paths[path].get.parameters.push({
    in: "query",
    name,
    required: false,
    schema: str,
  });
paths["/applications/{id}/runs"].post.parameters.push({
  in: "header",
  name: "Idempotency-Key",
  required: false,
  schema: { type: "string", maxLength: 200 },
});
paths["/applications/{id}/runs/{runId}/events"].get.parameters.push({
  in: "header",
  name: "Last-Event-ID",
  required: false,
  schema: str,
});
for (const action of ["deploy", "rollback", "action", "approve-preview"])
  add(
    `/applications/{id}/${action}`,
    "post",
    action,
    action === "deploy" || action === "rollback"
      ? ref("Deployment")
      : ref(action === "action" ? "Ok" : "Queued"),
    action === "deploy"
      ? object(
          {
            ref: str,
            fresh: {
              type: "boolean",
              description:
                "Recreate app-owned volumes; requires version and exact confirmName. Defaults to false.",
            },
            confirmName: {
              type: "string",
              description:
                "Exact application name acknowledging permanent volume data loss for Fresh deploy.",
            },
            version: {
              type: "integer",
              description:
                "Optional application revision; stale values return 409",
            },
          },
          [],
        )
      : action === "rollback"
        ? input({ releaseId: str })
        : action === "action"
          ? input({
              action: { type: "string", enum: ["start", "restart", "stop"] },
            })
          : input({
              sha: {
                type: "string",
                pattern: "^[a-fA-F0-9]{40,64}$",
              },
            }),
  );
add(
  "/applications/{id}/releases",
  "get",
  "Retained releases",
  array(ref("ApplicationRelease")),
);
paths["/applications/{id}/action"].post.summary =
  "Start, restart, or durably stop an application. Stop cancels deployment work and pauses automatic deployment until explicit resume.";
paths["/applications/{id}/action"].post.responses[202] = {
  description:
    "Stop accepted; poll application runtime until stopped or stop_failed",
  content: { "application/json": { schema: object({ ok: bool }) } },
};
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
add(
  "/deployments/{id}",
  "delete",
  "Delete a completed inactive deployment and its unused release artifacts",
  object({ jobId: str }),
);
paths["/deployments/{id}"].delete.responses[202] =
  paths["/deployments/{id}"].delete.responses[200];
delete paths["/deployments/{id}"].delete.responses[200];
paths["/deployments/{id}"].delete.responses[404] = {
  description: "Deployment not found",
};
add("/teams/{id}/members", "get", "Team members", array(ref("TeamMember")));
add(
  "/teams/{id}/invitations",
  "post",
  "Create invitation link",
  ref("InvitationResult"),
  input(
    {
      email: str,
      role: { type: "string", enum: ["owner", "member", "operator", "viewer"] },
      projectId: str,
    },
    ["email", "role"],
  ),
);
add(
  "/projects/{id}/members",
  "post",
  "Assign project role",
  ref("Ok"),
  input({
    userId: str,
    role: { type: "string", enum: ["owner", "operator", "viewer", "remove"] },
  }),
);
add("/teams/{id}/members/{user}", "delete", "Remove team member", ref("Ok"));
for (const [path, schema] of [
  ["/audit", "AuditEntry"],
  ["/jobs", "Job"],
])
  add(path, "get", path.slice(1), array(ref(schema)));
add(
  "/settings/maintenance",
  "post",
  "Set maintenance mode",
  object({ enabled: bool }),
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
  ref("AlertPolicyInput"),
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
add(
  "/hooks/{id}",
  "post",
  "Receive signed GitHub/Gitea webhook",
  ref("Accepted"),
  obj,
);
add(
  "/settings/certificates",
  "get",
  "Administrator certificate proxy selection",
  ref("CertificateNetwork"),
);
add(
  "/settings/certificates",
  "put",
  "Select direct connection or a saved SOCKS proxy for ACME",
  ref("CertificateNetwork"),
  ref("CertificateNetwork"),
);
add(
  "/monitoring/resources",
  "get",
  "Administrator resource monitoring summaries",
  array(ref("MonitoringResource")),
);
add(
  "/monitoring/defaults",
  "get",
  "Administrator server and application alert defaults",
  ref("MonitoringDefaults"),
);
add(
  "/monitoring/defaults",
  "put",
  "Update default alert policies and destinations",
  ref("MonitoringDefaults"),
  ref("MonitoringDefaults"),
);
add(
  "/monitoring/resources/{id}/policy",
  "get",
  "Read effective resource monitoring policy",
  ref("MonitoringPolicyState"),
);
add(
  "/monitoring/resources/{id}/policy",
  "put",
  "Override or disable resource monitoring policy",
  ref("MonitoringPolicyState"),
  ref("MonitoringPolicyState"),
);
add(
  "/monitoring/resources/{id}/policy",
  "delete",
  "Restore inherited monitoring policy",
  ref("MonitoringPolicyState"),
);
add(
  "/monitoring/incidents",
  "get",
  "Administrator monitoring incident history",
  array(ref("MonitoringIncident")),
);
add(
  "/notifications/{id}/test",
  "post",
  "Explicitly queue a test notification",
  object({ jobId: str }),
  input({}),
);
paths["/notifications/{id}/test"].post.responses[202] =
  paths["/notifications/{id}/test"].post.responses[200];
delete paths["/notifications/{id}/test"].post.responses[200];
add(
  "/notifications/{id}/delivery",
  "get",
  "Latest administrator notification delivery status",
  ref("NotificationDelivery"),
);
for (const path of ["/servers/{id}/metrics", "/applications/{id}/metrics"]) {
  paths[path].get.summary =
    "Administrator resource metrics with bounded history";
  paths[path].get.parameters.push({
    name: "range",
    in: "query",
    schema: {
      type: "string",
      enum: ["1h", "6h", "24h", "7d", "30d"],
      default: "24h",
    },
  });
}
for (const name of ["resourceId", "state"])
  paths["/monitoring/incidents"].get.parameters.push({
    name,
    in: "query",
    schema: str,
  });
paths["/dns/test"].post.requestBody.content[
  "application/json"
].schema.properties.proxyId = str;

const publicPaths = new Set([
  "/version",
  "/telemetry",
  "/auth/status",
  "/auth/setup",
  "/auth/login",
  "/auth/accept",
  "/hooks/{id}",
]);
for (const [path, name, location, schema] of [
  ["/resources", "kind", "query", str],
  ["/deployments", "applicationId", "query", str],
  [
    "/deployments/{id}/events",
    "after",
    "query",
    { type: "integer", minimum: 0 },
  ],
  ["/deployments/{id}/events", "Last-Event-ID", "header", str],
  ["/applications/{id}/logs", "container", "query", str],
  ["/applications/{id}/terminal", "shell", "query", str],
])
  paths[path].get.parameters.push({ name, in: location, schema });
// The non-server delete branches ignore request bodies; the server alias uses
// the same reviewed input as DELETE /servers/{id}.
paths["/resources/{id}"].delete.requestBody = {
  required: false,
  content: { "application/json": { schema: ref("ServerDeletionInput") } },
};
for (const name of [
  "ResourceInput",
  "ResourceUpdateInput",
  "ServerDeletionInput",
  "DeletionConnectionInput",
  "NetworkInput",
  "HAProxySettingsInput",
  "DashboardAccessInput",
  "ComposeSource",
  "HTTPReadinessCheck",
  "NetworkAttachment",
  "ServiceNetworking",
  "PublishedPort",
]) {
  schemas[name].additionalProperties = false;
}
const errorResponse = {
  description: "Request failed",
  content: { "application/json": { schema: ref("Error") } },
};
for (const [path, operations] of Object.entries(paths)) {
  for (const [method, operation] of Object.entries(operations)) {
    if (publicPaths.has(path)) operation.security = [];
    else if (["post", "put", "delete"].includes(method))
      operation.security = [{ session: [], csrf: [] }];
    for (const status of [
      400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 502, 503,
    ]) {
      operation.responses[status] = { $ref: "#/components/responses/Error" };
    }
    const body = operation.requestBody?.content?.["application/json"]?.schema;
    if (body?.properties) body.additionalProperties = false;
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
        responses: { Error: errorResponse },
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
