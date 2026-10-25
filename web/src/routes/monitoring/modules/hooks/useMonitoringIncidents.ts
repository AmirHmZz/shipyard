import { useApiQuery } from "@/lib/api/use-api-query";
import { monitoringKeys } from "@/lib/monitoring-keys";
import { monitoringIncidentsSchema } from "@/lib/schemas/monitoring";
export function useMonitoringIncidents(id: string) {
  return useApiQuery({
    queryKey: monitoringKeys.incidents(id),
    path: "/monitoring/incidents?resourceId=" + encodeURIComponent(id),
    schema: monitoringIncidentsSchema,
    refetchInterval: 30000,
  });
}
