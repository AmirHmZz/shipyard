export const applicationKeys = {
  deployment: (selected: string | null) => ["deployment", selected] as const,
  domain: (routeId: string) => ["domain", routeId] as const,
  composeSource: (appId: string, version: number) =>
    ["compose-source", appId, version] as const,
  runtime: (id: string) => ["runtime", id] as const,
  releases: (id: string) => ["releases", id] as const,
  networking: (appId: string, version?: number) =>
    ["networking", appId, version] as const,
  networkingPrefix: (appId: string) => ["networking", appId] as const,
  metrics: (id: string) => ["application-metrics", id] as const,
};
