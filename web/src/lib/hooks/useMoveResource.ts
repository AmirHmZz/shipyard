import { useQueryClient } from "@tanstack/react-query";

import type { Resource } from "@/lib/api/types";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";
import { moveCard } from "@/lib/resource-card-order";
import { getResourcesResponseSchema } from "@/lib/schemas/endpoint-responses";

export function useMoveResource() {
  const client = useQueryClient();
  return useApiMutation({
    mutationKey: ["resource-card-order"],
    method: "POST",
    path: ({ id }: { id: string; beforeId: string | null }) =>
      apiPath`/resources/${id}/move`,
    body: ({ beforeId }) => ({ beforeId }),
    schema: getResourcesResponseSchema,
    onMutate: async ({ id, beforeId }) => {
      await client.cancelQueries({ queryKey: resourceKeys.all });
      const previous = client.getQueryData<Resource[]>(resourceKeys.all);
      client.setQueryData<Resource[]>(
        resourceKeys.all,
        (rows) => rows && moveCard(rows, id, beforeId),
      );
      return previous;
    },
    onError: (_error, _variables, previous) => {
      if (previous) client.setQueryData(resourceKeys.all, previous);
    },
    onSuccess: (rows) => {
      client.setQueryData(resourceKeys.all, rows);
    },
    invalidate: [resourceKeys.all],
  });
}
