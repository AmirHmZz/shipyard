import { DeploymentsMainView } from "./modules/components";

export default function DeploymentsRoute() {
  return <DeploymentsMainView />;
}

export const meta = () => [{ title: "Deployments — Shipyard" }];
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
