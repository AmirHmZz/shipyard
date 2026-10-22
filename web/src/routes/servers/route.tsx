import { ServersMainView } from "./modules/components";

export default function ServersRoute() {
  return <ServersMainView />;
}

export function meta() {
  return [{ title: "Servers — Shipyard" }];
}
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
