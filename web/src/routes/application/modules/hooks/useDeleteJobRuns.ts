import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import { jobKeys } from "../generics/jobs";

export function useDeleteJobRuns(id: string) {
  return useApiMutation({
    method: (ids: string[]) => (ids.length === 1 ? "DELETE" : "POST"),
    path: (ids: string[]) =>
      ids.length === 1
        ? apiPath`/applications/${id}/runs/${ids[0]}`
        : apiPath`/applications/${id}/runs/delete`,
    body: (ids) => (ids.length === 1 ? undefined : { ids }),
    schema: okResponseSchema,
    invalidate: [jobKeys.all(id)],
    meta: { successMessage: "Job runs deleted" },
  });
}
