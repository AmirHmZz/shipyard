export type ResourceKind =
  | "team"
  | "project"
  | "environment"
  | "server"
  | "git"
  | "dns"
  | "zone"
  | "application"
  | "route"
  | "webhook";
export type Field = {
  key: string;
  label: string;
  type?:
    "number" | "switch" | "secret" | "password" | "textarea" | "json" | "csv";
  options?: string[];
  resource?: string;
  help?: string;
};
export const fields: Record<ResourceKind, Field[]> = {
  team: [],
  project: [],
  environment: [],
  server: [
    { key: "host", label: "SSH hostname / IP" },
    { key: "port", label: "SSH port", type: "number" },
    { key: "user", label: "SSH user" },
    {
      key: "authMethod",
      label: "SSH authentication",
      options: ["private_key", "password"],
      help: "Private keys are recommended. Passwords are encrypted and never returned.",
    },
    {
      key: "fingerprint",
      label: "Verified host fingerprint",
      help: "Compare the SHA256 fingerprint with a trusted source before saving.",
    },
    { key: "private_key", label: "SSH private key", type: "secret" },
    { key: "password", label: "SSH password", type: "password" },
    { key: "ipv4", label: "Public IPv4" },
    { key: "ipv6", label: "Public IPv6 (optional)" },
  ],
  git: [
    { key: "provider", label: "Provider", options: ["github", "gitea"] },
    {
      key: "url",
      label: "Gitea instance URL",
      help: "HTTPS URL, for example https://git.example.com",
    },
    { key: "appId", label: "GitHub App ID" },
    { key: "installationId", label: "GitHub installation ID" },
    { key: "private_key", label: "GitHub App private key", type: "secret" },
    { key: "token", label: "Gitea API token", type: "secret" },
    {
      key: "webhook_secret",
      label: "Webhook signing secret",
      type: "secret",
      help: "Use the same secret in your GitHub App / Gitea webhook configuration.",
    },
  ],
  dns: [
    {
      key: "provider",
      label: "DNS provider",
      options: ["cloudflare", "arvancloud"],
    },
    { key: "token", label: "Provider API token", type: "secret" },
  ],
  zone: [],
  application: [
    { key: "source", label: "Source", options: ["git", "compose"] },
    {
      key: "engine",
      label: "Deployment type",
      options: ["dockerfile", "compose"],
    },
    { key: "serverId", label: "Target server", resource: "server" },
    { key: "gitId", label: "Git connection", resource: "git" },
    {
      key: "repository",
      label: "Repository",
    },
    { key: "branch", label: "Branch" },
    {
      key: "context",
      label: "Build context",
    },
    {
      key: "file",
      label: "Dockerfile",
    },
    { key: "port", label: "Application port (0 for workers)", type: "number" },
    {
      key: "worker",
      label: "Background worker (recreate deployment)",
      type: "switch",
    },
    { key: "healthPath", label: "HTTP readiness path (optional)" },
    {
      key: "healthTimeout",
      label: "Readiness deadline (seconds)",
      type: "number",
    },
    { key: "autoDeploy", label: "Deploy on branch pushes", type: "switch" },
    { key: "previews", label: "Pull request previews", type: "switch" },
    {
      key: "previewDomain",
      label: "Preview wildcard domain",
      help: "For example *.preview.example.com",
    },
    { key: "previewZoneId", label: "Preview domain zone", resource: "zone" },
    { key: "profiles", label: "Compose profiles", type: "csv" },
    {
      key: "buildArgs",
      label: "Build arguments (JSON)",
      type: "json",
      help: "Use build secrets for credentials; build arguments can appear in image metadata.",
    },
    { key: "registry", label: "Private registry (optional)" },
    { key: "registryUser", label: "Registry username" },
    {
      key: "registry_password",
      label: "Registry password / token",
      type: "secret",
    },
  ],
  route: [
    { key: "protocol", label: "Protocol", options: ["https", "grpc", "tcp"] },

    {
      key: "service",
      label: "Compose service name",
      help: "Use app for Dockerfile deployments.",
    },
    { key: "targetPort", label: "Container port", type: "number" },
    {
      key: "tls",
      label: "TLS mode",
      options: ["terminate", "passthrough"],
    },

    { key: "listenPort", label: "Public TCP port (TCP only)", type: "number" },
  ],
  webhook: [
    { key: "url", label: "Webhook HTTPS URL" },
    {
      key: "events",
      label: "Events (comma-separated; empty for all)",
      type: "csv",
    },
    {
      key: "signing_secret",
      label: "Signing secret (optional)",
      type: "secret",
    },
  ],
};
export const defaults: Record<string, Record<string, unknown>> = {
  server: { port: 22, user: "root", authMethod: "private_key" },
  git: { provider: "github" },
  dns: { provider: "cloudflare" },
  application: {
    source: "git",
    engine: "dockerfile",
    branch: "main",
    context: ".",
    file: "Dockerfile",
    port: 3000,
    healthTimeout: 120,
    profiles: [],
    buildArgs: {},
  },
  route: {
    protocol: "https",
    service: "app",
    targetPort: 3000,
    tls: "terminate",

    listenPort: 9000,
  },
};
export const parents: Record<string, string> = {
  project: "team",
  environment: "project",
  application: "environment",
  route: "application",
  zone: "dns",
};
