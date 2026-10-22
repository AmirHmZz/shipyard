import { OverviewMainView } from "./modules/components";

export default function OverviewRoute() {
  return <OverviewMainView />;
}

export function meta() {
  return [{ title: "Overview — Shipyard" }];
}
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
