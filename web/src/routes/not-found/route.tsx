import { NotFoundMainView } from "./modules/components";

export default function NotFoundRoute() {
  return <NotFoundMainView />;
}

export function meta() {
  return [{ title: "Not found — Shipyard" }];
}
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
