import { useQuery } from "@tanstack/react-query";

import { POLL_INTERVALS } from "@/lib/constants";
import { deploymentKeys } from "@/lib/query-keys";
import { getDeployments } from "@/lib/services";
export function useDeployments(id?: string) {
  return useQuery({
    queryKey: deploymentKeys.list(id),
    queryFn: () => getDeployments(id),
    refetchInterval: POLL_INTERVALS.deployment,
  });
}
