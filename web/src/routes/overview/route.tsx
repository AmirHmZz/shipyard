import { OverviewMainView } from "./modules/components";

export default function OverviewRoute() {
  return <OverviewMainView />;
}

export const meta = () => [{ title: "Overview — Shipyard" }];
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
