import { useQueryClient } from "@tanstack/react-query";

import type { Resource } from "@/lib/api/types";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";
import { resourceResponseSchema } from "@/lib/schemas/resources";

export function useSaveResourceLogo(id: string) {
  const client = useQueryClient();
  return useApiMutation({
    method: (image: string | null) => (image === null ? "DELETE" : "PUT"),
    path: apiPath`/resources/${id}/logo`,
    body: (image) => (image === null ? undefined : { image }),
    schema: resourceResponseSchema,
    mutationKey: ["resource-logo", id],
    onSuccess: (saved) => {
      client.setQueryData<Resource[]>(resourceKeys.all, (rows) =>
        rows?.map((row) =>
          row.id === saved.id ? { ...row, logoUrl: saved.logoUrl } : row,
        ),
      );
    },
    invalidate: [resourceKeys.all],
    meta: { successMessage: "Logo updated" },
  });
}
