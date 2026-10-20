import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { deploymentKeys } from "@/lib/query-keys";
import { jobResponseSchema } from "@/lib/schemas/acknowledgements";

import { applicationKeys } from "../generics";
export function useRemoveDeployment(applicationId: string) {
  return useApiMutation({
    method: "DELETE",
    path: (deploymentId: string) => apiPath`/deployments/${deploymentId}`,
    schema: jobResponseSchema,
    invalidate: [deploymentKeys.all, applicationKeys.releases(applicationId)],
    meta: { successMessage: "Deployment cleanup queued" },
  });
}
