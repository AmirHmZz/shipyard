import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

export function useDeleteRegistry() {
  return useApiMutation({
    method: "DELETE",
    path: (id: string) => apiPath`/resources/${id}`,
    body: () => ({}),
    schema: okResponseSchema,
    invalidate: [resourceKeys.all],
    meta: { successMessage: "Registry integration deleted" },
  });
}
