import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";
import { deploymentKeys } from "@/lib/query-keys";
import { getDeploymentsResponseSchema } from "@/lib/schemas/endpoint-responses";
export function useDeployments(id?: string) {
  return useApiQuery({
    queryKey: deploymentKeys.list(id),
    path: `/deployments${id ? `?applicationId=${encodeURIComponent(id)}` : ""}`,
    schema: getDeploymentsResponseSchema,
    refetchInterval: POLL_INTERVALS.deployment,
  });
}
