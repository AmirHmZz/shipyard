import * as z from "zod/mini";

import { useApiQuery } from "@/lib/api/use-api-query";
import { monitoringKeys } from "@/lib/monitoring-keys";
import { apiPath } from "@/lib/paths";
import { metricResponseSchema } from "@/lib/schemas/metrics";
export function useMonitoringMetrics(id: string, kind: string, range: string) {
  const path =
    kind === "server"
      ? apiPath`/servers/${id}/metrics`
      : apiPath`/applications/${id}/metrics`;
  return useApiQuery({
    queryKey: monitoringKeys.metrics(id, range),
    path: path + "?range=" + encodeURIComponent(range),
    schema: z.array(metricResponseSchema),
    enabled: !!id,
    refetchInterval: 30000,
  });
}
