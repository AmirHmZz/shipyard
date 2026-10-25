export const RESOURCE_KINDS = [
  "team",
  "project",
  "environment",
  "server",
  "git",
  "dns",
  "registry",
  "zone",
  "application",
  "route",
  "webhook",
  "proxy",
] as const;
export const PROJECT_ROLES = ["owner", "operator", "viewer"] as const;
export const ASSIGNMENT_ROLES = [...PROJECT_ROLES, "remove"] as const;
export const INVITATION_ROLES = ["member", ...PROJECT_ROLES] as const;
export const DNS_PROVIDERS = ["cloudflare", "arvancloud"] as const;
export const GIT_PROVIDERS = ["github", "gitea"] as const;
export const SSH_AUTH_METHODS = ["private_key", "password"] as const;
