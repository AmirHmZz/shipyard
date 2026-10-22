import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { jobResponseSchema } from "@/lib/schemas/acknowledgements";

import { serverDeletionKeys } from "../generics";
export function useRetryServerDeletion(id: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/servers/${id}/deletion/retry`,
    body: () => ({}),
    schema: jobResponseSchema,
    invalidate: [serverDeletionKeys.status(id)],
  });
}
