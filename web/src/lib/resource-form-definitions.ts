import type { ResourceKind } from "@/lib/types";
export type { ResourceKind } from "@/lib/types";
import { DNS_PROVIDERS, GIT_PROVIDERS, SSH_AUTH_METHODS } from "@/lib/enums";
export type Field = {
  key: string;
  label: string;
  type?:
    | "number"
    | "switch"
    | "secret"
    | "password"
    | "textarea"
    | "json"
    | "csv"
    | "readiness"
    | "previewRouting";
  options?: readonly string[];
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
      options: SSH_AUTH_METHODS,
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
    { key: "provider", label: "Provider", options: GIT_PROVIDERS },
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
  proxy: [
    { key: "scheme", label: "Proxy type", options: ["socks5", "socks5h"] },
    { key: "host", label: "Proxy hostname or IP" },
    { key: "port", label: "Proxy port", type: "number" },
    { key: "username", label: "Proxy username (optional)", type: "secret" },
    { key: "password", label: "Proxy password (optional)", type: "password" },
  ],
  dns: [
    {
      key: "provider",
      label: "DNS provider",
      options: DNS_PROVIDERS,
    },
    { key: "token", label: "Provider API token", type: "secret" },
    { key: "proxyId", label: "Connection proxy", resource: "proxy" },
  ],
  zone: [],
  registry: [
    {
      key: "hostname",
      label: "Registry hostname",
      help: "For example ghcr.io, docker.io, or registry.example.com:5000. Images select credentials automatically.",
    },
    { key: "username", label: "Username" },
    { key: "password", label: "Password / token", type: "password" },
  ],
  application: [
    {
      key: "workload",
      label: "Workload",
      options: ["service", "job"],
      help: "Jobs run to completion. Deploy prepares a version; execution is manual or scheduled.",
    },
    {
      key: "jobService",
      label: "Job target service",
      help: "Only this Compose service runs. Dependencies are not started; keep databases in separate applications.",
    },
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
    {
      key: "worker",
      label: "Background worker (recreate deployment)",
      type: "switch",
    },
    {
      key: "readinessMode",
      label: "Readiness policy",
      options: ["container", "checks"],
      help: "Container status confirms process startup; the service may accept traffic later. Additional checks wait for Docker health, routed ports, and optional HTTP checks.",
    },
    {
      key: "readinessChecks",
      label: "HTTP readiness checks (optional)",
      type: "readiness",
    },
    {
      key: "healthTimeout",
      label: "Readiness deadline (seconds)",
      type: "number",
    },
    { key: "autoDeploy", label: "Deploy on branch pushes", type: "switch" },
    { key: "previews", label: "Pull request previews", type: "switch" },
    { key: "previewRouting", label: "Preview routing", type: "previewRouting" },
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
    {
      key: "provider",
      label: "Notification provider",
      options: ["webhook", "telegram", "bale"],
    },
    { key: "chatId", label: "Chat ID or channel username" },
    { key: "token", label: "Bot token", type: "secret" },
    { key: "proxyId", label: "Connection proxy", resource: "proxy" },
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
  proxy: { scheme: "socks5h", port: 1080 },
  webhook: { provider: "webhook", events: [] },
  server: { port: 22, user: "root", authMethod: "private_key" },
  git: { provider: "github" },
  dns: { provider: "cloudflare" },
  application: {
    workload: "service",
    jobService: "",
    source: "git",
    engine: "dockerfile",
    branch: "main",
    context: ".",
    file: "Dockerfile",
    readinessMode: "container",
    readinessChecks: [],
    previewRouting: { mode: "inherit" },
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
