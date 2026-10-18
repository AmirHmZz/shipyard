export const loadComposeEditor = () =>
  import("@/components/compose-code-editor");
export const loadConfiguration = () => import("@/pages/configuration");
export const loadNetworks = () => import("@/pages/networks");
export const loadProjects = () => import("@/pages/projects");
export const loadApplication = () => import("@/pages/application");
export const loadInfrastructure = () => import("@/pages/infrastructure");
export const loadSettings = () => import("@/pages/settings");

export function preloadRoute(path: string) {
  const loader = path.startsWith("/configure/")
    ? loadConfiguration
    : path.startsWith("/applications/")
      ? loadApplication
      : path.startsWith("/projects")
        ? loadProjects
        : path.startsWith("/networks")
          ? loadNetworks
          : path.startsWith("/settings") || path.startsWith("/teams")
            ? loadSettings
            : ["/servers", "/dns", "/integrations"].some((prefix) =>
                  path.startsWith(prefix),
                )
              ? loadInfrastructure
              : null;
  if (loader) void loader().catch(() => {});
}
