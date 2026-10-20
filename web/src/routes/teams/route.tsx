import { TeamsMainView } from "./modules/components";

export default function TeamsRoute() {
  return <TeamsMainView />;
}

export function meta() {
  return [{ title: "Teams — Shipyard" }];
}
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
