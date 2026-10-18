import { metricsKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { getServerMetrics } from "../services";
import type { Resource } from "@/lib/api";

export function useServerMetrics(server: Resource) {
  return useQuery({
    queryKey: metricsKeys.server(server.id),
    queryFn: () => getServerMetrics(server),
    refetchInterval: 30000,
  });
}
