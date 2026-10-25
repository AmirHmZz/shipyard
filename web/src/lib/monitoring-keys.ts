export const monitoringKeys = {
  all: ["monitoring"] as const,
  resources: ["monitoring", "resources"] as const,
  defaults: ["monitoring", "defaults"] as const,
  policy: (id: string) => ["monitoring", "policy", id] as const,
  metrics: (id: string, range: string) =>
    ["monitoring", "metrics", id, range] as const,
  incidents: (id: string) => ["monitoring", "incidents", id] as const,
  certificate: ["certificate-network"] as const,
  delivery: (id: string) => ["notification-delivery", id] as const,
};
