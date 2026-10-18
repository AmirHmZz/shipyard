import { DNSMainView } from "../modules/components";

export default function DNSRoute() {
  return <DNSMainView />;
}

export const meta = () => [{ title: "DNS — Shipyard" }];
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
