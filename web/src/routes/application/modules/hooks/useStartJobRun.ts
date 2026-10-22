import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";

import { jobKeys, jobRunSchema } from "../generics/jobs";
export function useStartJobRun(id: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/applications/${id}/runs`,
    body: (key: string) => ({ idempotencyKey: key }),
    schema: jobRunSchema,
    invalidate: [jobKeys.all(id)],
    meta: { successMessage: "Job run queued" },
  });
}
