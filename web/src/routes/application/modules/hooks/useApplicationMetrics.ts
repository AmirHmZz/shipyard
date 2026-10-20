import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";
import { apiPath } from "@/lib/paths";

import {
  applicationKeys,
  getApplicationMetricsResponseSchema,
} from "../generics";
export function useApplicationMetrics(id: string, enabled: boolean) {
  return useApiQuery({
    queryKey: applicationKeys.metrics(id),
    path: apiPath`/applications/${id}/metrics`,
    schema: getApplicationMetricsResponseSchema,
    enabled,
    refetchInterval: POLL_INTERVALS.metrics,
  });
}
