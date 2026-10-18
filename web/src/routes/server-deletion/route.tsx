import { ServerDeletionMainView } from "./modules/components";

export default function ServerDeletionRoute() {
  return <ServerDeletionMainView />;
}

export const meta = () => [{ title: "Server deletion — Shipyard" }];
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
