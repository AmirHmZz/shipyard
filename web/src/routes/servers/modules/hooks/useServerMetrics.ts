import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { POLL_INTERVALS } from "@/lib/constants";
import { metricsKeys } from "@/lib/query-keys";

import { getServerMetrics } from "../services";

export function useServerMetrics(server: Resource) {
  return useQuery({
    queryKey: metricsKeys.server(server.id),
    queryFn: () => getServerMetrics(server),
    refetchInterval: POLL_INTERVALS.metrics,
  });
}
