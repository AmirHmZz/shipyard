import { NetworksMainView } from "./modules/components";

export default function NetworksRoute() {
  return <NetworksMainView />;
}

export function meta() {
  return [{ title: "Networks — Shipyard" }];
}
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
