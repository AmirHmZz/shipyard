import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";

import { serverDeletionPlanResponseSchema } from "../generics";

export function useReviewServerDeletion() {
  return useApiMutation({
    method: "POST",
    path: (id: string) => apiPath`/servers/${id}/deletion-plan`,
    body: () => ({}),
    schema: serverDeletionPlanResponseSchema,
  });
}
