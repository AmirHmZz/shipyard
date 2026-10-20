import { ConfigurationGuard } from "@/components/ConfigurationSurface";

import { DashboardAccessForm } from "./DashboardAccessForm";

export function DashboardAccess() {
  return (
    <ConfigurationGuard className="max-w-none">
      <DashboardAccessForm />
    </ConfigurationGuard>
  );
}
