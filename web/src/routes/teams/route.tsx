import { TeamsMainView } from "./modules/components";

export default function TeamsRoute() {
  return <TeamsMainView />;
}

export const meta = () => [{ title: "Teams — Shipyard" }];
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
