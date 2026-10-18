import { ApplicationMainView } from "./modules/components";

export default function ApplicationRoute() {
  return <ApplicationMainView />;
}

export const meta = () => [{ title: "Application — Shipyard" }];
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
export const handle = { pageLabel: "Applications" };
