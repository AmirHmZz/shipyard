export const settingsKeys = {
  users: ["users"] as const,
  systemUpdates: ["system-updates"] as const,
  history: (type: string) => [type] as const,
  dashboardAccess: ["dashboard-access"] as const,
  alertPolicy: ["alert-policy"] as const,
};
