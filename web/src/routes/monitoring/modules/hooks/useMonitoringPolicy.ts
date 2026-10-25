import { useApiQuery } from "@/lib/api/use-api-query";
import { monitoringKeys } from "@/lib/monitoring-keys";
import { apiPath } from "@/lib/paths";
import { monitoringPolicyStateSchema } from "@/lib/schemas/monitoring";
export function useMonitoringPolicy(id: string) {
  return useApiQuery({
    queryKey: monitoringKeys.policy(id),
    path: apiPath`/monitoring/resources/${id}/policy`,
    schema: monitoringPolicyStateSchema,
    enabled: !!id,
  });
}
