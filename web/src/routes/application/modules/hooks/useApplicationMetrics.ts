import { useQuery } from "@tanstack/react-query";

import { applicationKeys } from "../generics";
import { getApplicationMetrics } from "../services";

export function useApplicationMetrics(id: string, enabled: boolean) {
  return useQuery({
    queryKey: applicationKeys.metrics(id),
    enabled: enabled,
    queryFn: () => getApplicationMetrics(id),
    refetchInterval: 30000,
  });
}
