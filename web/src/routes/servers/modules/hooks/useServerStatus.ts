import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";
import { apiPath } from "@/lib/paths";
import { metricsKeys } from "@/lib/query-keys";

import { serverStatusResponseSchema } from "../generics";

export function useServerStatus(serverId: string, enabled: boolean) {
  return useApiQuery({
    enabled,
    queryKey: metricsKeys.serverStatus(serverId),
    path: apiPath`/servers/${serverId}/status`,
    schema: serverStatusResponseSchema,
    refetchInterval: POLL_INTERVALS.metrics,
  });
}
