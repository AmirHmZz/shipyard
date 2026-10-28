import { useQueryClient } from "@tanstack/react-query";

import type { Resource } from "@/lib/api/types";
import type { SaveResourceValues } from "@/lib/types";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";
import { resourceResponseSchema } from "@/lib/schemas/resources";
export function useSaveResource() {
  const client = useQueryClient();
  return useApiMutation({
    method: ({ existingId }: SaveResourceValues) =>
      existingId ? "PUT" : "POST",
    path: ({ existingId }) =>
      existingId ? apiPath`/resources/${existingId}` : "/resources",
    body: ({ kind, payload }) =>
      kind === "route" ? { ...payload, name: undefined } : payload,
    schema: resourceResponseSchema,
    onSuccess: (saved) => {
      client.setQueryData<Resource[]>(resourceKeys.all, (rows) =>
        rows?.map((row) => (row.id === saved.id ? saved : row)),
      );
    },
    invalidate: [resourceKeys.all],
  });
}
