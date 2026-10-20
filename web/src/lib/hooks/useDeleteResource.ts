import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";
import { deletionResponseSchema } from "@/lib/schemas/acknowledgements";
export function useDeleteResource() {
  return useApiMutation({
    method: "DELETE",
    path: (id: string) => apiPath`/resources/${id}`,
    body: () => ({}),
    schema: deletionResponseSchema,
    invalidate: [resourceKeys.all],
    meta: {
      successMessage:
        "Deletion queued. Cleanup will continue in the background.",
    },
  });
}
