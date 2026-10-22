import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";
import { deletionResponseSchema } from "@/lib/schemas/acknowledgements";
export function useDeleteActionResource() {
  return useApiMutation({
    method: "DELETE",
    path: (action: string) => apiPath`/resources/${action.split(":")[1]}`,
    body: () => ({}),
    schema: deletionResponseSchema,
    invalidate: [resourceKeys.all],
  });
}
