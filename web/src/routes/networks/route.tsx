import { NetworksMainView } from "./modules/components";

export default function NetworksRoute() {
  return <NetworksMainView />;
}

export const meta = () => [{ title: "Networks — Shipyard" }];
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
