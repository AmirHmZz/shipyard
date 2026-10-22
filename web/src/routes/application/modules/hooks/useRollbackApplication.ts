import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";

import { deploymentCreationResultResponseSchema } from "../generics";
export function useRollbackApplication(id: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/applications/${id}/rollback`,
    body: (payload: { releaseId: string }) => payload,
    schema: deploymentCreationResultResponseSchema,
  });
}
