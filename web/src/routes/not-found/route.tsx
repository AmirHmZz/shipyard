import { NotFoundMainView } from "./modules/components";

export default function NotFoundRoute() {
  return <NotFoundMainView />;
}

export const meta = () => [{ title: "Not found — Shipyard" }];
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
