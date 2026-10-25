import { useAdmin } from "@/lib/session";

import { MonitoringMainView } from "./modules/components";

export default function MonitoringRoute() {
  const admin = useAdmin();
  if (!admin) return <p>Platform administrator access required.</p>;
  return <MonitoringMainView />;
}
export function meta() {
  return [{ title: "Monitoring — Shipyard" }];
}
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
