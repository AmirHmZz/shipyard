import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";
import { resourceResponseSchema } from "@/lib/schemas/resources";

import type { PreviewSaveValues } from "../generics";
export function useSaveApplicationPreview() {
  return useApiMutation({
    method: "PUT",
    path: ({ id }: PreviewSaveValues) => apiPath`/resources/${id}`,
    body: ({ payload }) => payload,
    schema: resourceResponseSchema,
    invalidate: [resourceKeys.all],
  });
}
