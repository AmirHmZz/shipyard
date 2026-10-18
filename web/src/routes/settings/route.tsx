import { SettingsMainView } from "./modules/components";
import { useCurrentSession } from "@/lib/session";

export default function SettingsRoute() {
  const session = useCurrentSession();
  return <SettingsMainView session={session} />;
}

export const meta = () => [{ title: "Settings — Shipyard" }];
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
