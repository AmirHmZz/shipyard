import { useApiQuery } from "@/lib/api/use-api-query";
import { monitoringKeys } from "@/lib/monitoring-keys";
import { monitoringResourcesSchema } from "@/lib/schemas/monitoring";
export function useMonitoringResources() {
  return useApiQuery({
    queryKey: monitoringKeys.resources,
    path: "/monitoring/resources",
    schema: monitoringResourcesSchema,
    refetchInterval: 30000,
  });
}
