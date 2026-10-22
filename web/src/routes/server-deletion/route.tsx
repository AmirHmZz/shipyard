import { ServerDeletionMainView } from "./modules/components";

export default function ServerDeletionRoute() {
  return <ServerDeletionMainView />;
}

export function meta() {
  return [{ title: "Server deletion — Shipyard" }];
}
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
