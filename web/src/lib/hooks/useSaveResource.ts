import type { SaveResourceValues } from "@/lib/types";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";
import { resourceResponseSchema } from "@/lib/schemas/resources";
export function useSaveResource() {
  return useApiMutation({
    method: ({ existingId }: SaveResourceValues) =>
      existingId ? "PUT" : "POST",
    path: ({ existingId }) =>
      existingId ? apiPath`/resources/${existingId}` : "/resources",
    body: ({ kind, payload }) =>
      kind === "route" ? { ...payload, name: undefined } : payload,
    schema: resourceResponseSchema,
    invalidate: [resourceKeys.all],
  });
}
