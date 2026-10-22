import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";

import { jobKeys, jobRunSchema } from "../generics/jobs";
export function useCancelJobRun(id: string) {
  return useApiMutation({
    method: "POST",
    path: (run: string) => apiPath`/applications/${id}/runs/${run}/cancel`,
    schema: jobRunSchema,
    invalidate: [jobKeys.all(id)],
    meta: { successMessage: "Cancellation requested" },
  });
}
