import type { RouteHandle } from "@/lib/route-handle";

import { ConfigurationMainView } from "./modules/components";

export default function ConfigurationRoute() {
  return <ConfigurationMainView />;
}

export const meta = () => [{ title: "Configuration — Shipyard" }];
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
export const handle: RouteHandle = {
  pageLabel: (params) =>
    params.id === "new"
      ? `New ${(params.kind || "").replaceAll("-", " ")}`
      : "Configuration",
};
