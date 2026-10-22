const key = "shipyard.sidebar.v1";

export function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(key) === "collapsed";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(key, collapsed ? "collapsed" : "expanded");
  } catch {
    /* Navigation also works without persistent storage. */
  }
}

export function formatBuildVersion(version: string | undefined) {
  if (!version) return "";
  if (version === "dev") return version;
  return `v${version.replace(/^v/, "")}`;
}
