import { DeploymentsMainView } from "./modules/components";

export default function DeploymentsRoute() {
  return <DeploymentsMainView />;
}

export function meta() {
  return [{ title: "Deployments — Shipyard" }];
}
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
