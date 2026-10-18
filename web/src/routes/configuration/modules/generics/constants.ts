export const configurationKeys = {
  haproxy: (serverId: string) => ["haproxy", serverId] as const,
  gitSetup: (id?: string) => ["git-setup", id] as const,
  gitSetupConfig: ["git-setup-config"] as const,
  giteaInstances: ["gitea-instances"] as const,
};
