export const settingsKeys = {
  updatePlan: ["update-plan"] as const,
  maintenance: ["set-maintenance"] as const,
  users: ["users"] as const,
  systemUpdates: ["system-updates"] as const,
  history: (type: string) => [type] as const,
  dashboardAccess: ["dashboard-access"] as const,
  alertPolicy: ["alert-policy"] as const,
};
