export const resourceKeys = { all: ["resources"] as const };
export const buildInfoKeys = { all: ["build-info"] as const };
export const sessionKeys = { all: ["session"] as const };
export const deploymentKeys = {
  all: ["deployments"] as const,
  list: (applicationId?: string) => ["deployments", applicationId] as const,
};
export const metricsKeys = {
  all: ["metrics"] as const,
  server: (serverId: string) => ["metrics", serverId] as const,
};
export const dockerNetworkKeys = {
  all: ["docker-networks"] as const,
  filter: (filter: string) => ["docker-networks", filter] as const,
  server: (server: string) => ["docker-networks", server] as const,
};
export const controlPlaneNetworkKeys = {
  all: ["control-plane-networks"] as const,
};
export const applicationServiceKeys = {
  parent: (parent: string) => ["application-services", parent] as const,
  version: (applicationId: string, version: number) =>
    ["application-services", applicationId, version] as const,
};
export const providerZoneKeys = {
  parent: (parent: string) => ["provider-zones", parent] as const,
};
export const repositoryKeys = {
  git: (gitId: string) => ["repositories", gitId] as const,
};
export const branchKeys = {
  repository: (gitId: string, repository: string) =>
    ["branches", gitId, repository] as const,
};
export const grantKeys = {
  resource: (resourceId: string) => ["grants", resourceId] as const,
};
