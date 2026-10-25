import type { MonitoringPolicyState } from "@/lib/schemas/monitoring";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { monitoringKeys } from "@/lib/monitoring-keys";
import { apiPath } from "@/lib/paths";
import { monitoringPolicyStateSchema } from "@/lib/schemas/monitoring";
export function useSaveMonitoringPolicy(id: string) {
  return useApiMutation({
    method: "PUT",
    path: apiPath`/monitoring/resources/${id}/policy`,
    body: (value: MonitoringPolicyState) => value,
    schema: monitoringPolicyStateSchema,
    invalidate: [monitoringKeys.all],
    meta: { successMessage: "Monitoring policy saved" },
  });
}
