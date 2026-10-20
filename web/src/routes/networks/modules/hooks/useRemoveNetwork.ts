import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { dockerNetworkKeys, resourceKeys } from "@/lib/query-keys";
import { deletionResponseSchema } from "@/lib/schemas/acknowledgements";

export function useRemoveNetwork() {
  return useApiMutation({
    method: "DELETE",
    path: (id: string) => apiPath`/resources/${id}`,
    body: () => ({}),
    schema: deletionResponseSchema,
    invalidate: [resourceKeys.all, dockerNetworkKeys.all],
  });
}
