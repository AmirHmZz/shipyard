import { useApiQuery } from "@/lib/api/use-api-query";
import { monitoringKeys } from "@/lib/monitoring-keys";
import { monitoringDefaultsSchema } from "@/lib/schemas/monitoring";
export function useMonitoringDefaults() {
  return useApiQuery({
    queryKey: monitoringKeys.defaults,
    path: "/monitoring/defaults",
    schema: monitoringDefaultsSchema,
  });
}
