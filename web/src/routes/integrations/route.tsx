import { IntegrationsMainView } from "./modules/components";

export default function IntegrationsRoute() {
  return <IntegrationsMainView />;
}

export function meta() {
  return [{ title: "Integrations — Shipyard" }];
}
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
