import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { metricsKeys } from "@/lib/query-keys";

import { getServerMetrics } from "../services";

export function useServerMetrics(server: Resource) {
  return useQuery({
    queryKey: metricsKeys.server(server.id),
    queryFn: () => getServerMetrics(server),
    refetchInterval: 30000,
  });
}
