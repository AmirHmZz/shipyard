import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";
import { deploymentResponseSchema } from "@/lib/schemas/deployments";

import { applicationKeys } from "../generics";
export function useSelectedDeployment(
  selected: string | null,
  enabled: boolean,
) {
  return useApiQuery({
    queryKey: applicationKeys.deployment(selected),
    path: apiPath`/deployments/${selected}`,
    schema: deploymentResponseSchema,
    enabled,
    retry: false,
  });
}
