import { IntegrationsMainView } from "./modules/components";

export default function IntegrationsRoute() {
  return <IntegrationsMainView />;
}

export const meta = () => [{ title: "Integrations — Shipyard" }];
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
