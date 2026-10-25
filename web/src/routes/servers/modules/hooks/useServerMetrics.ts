import type { Resource } from "@/lib/api/types";

import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";
import { apiPath } from "@/lib/paths";
import { metricsKeys } from "@/lib/query-keys";

import { getServerMetricsResponseSchema } from "../generics";

export function useServerMetrics(server: Resource, enabled = true) {
  return useApiQuery({
    enabled,
    queryKey: metricsKeys.server(server.id),
    path: apiPath`/servers/${server.id}/metrics`,
    schema: getServerMetricsResponseSchema,
    refetchInterval: POLL_INTERVALS.metrics,
  });
}
