import type { MonitoringDefaults } from "@/lib/schemas/monitoring";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { monitoringKeys } from "@/lib/monitoring-keys";
import { monitoringDefaultsSchema } from "@/lib/schemas/monitoring";
export function useSaveMonitoringDefaults() {
  return useApiMutation({
    method: "PUT",
    path: "/monitoring/defaults",
    body: (value: MonitoringDefaults) => value,
    schema: monitoringDefaultsSchema,
    invalidate: [monitoringKeys.all],
    meta: { successMessage: "Monitoring defaults saved" },
  });
}
