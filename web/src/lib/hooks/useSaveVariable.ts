import type { Resource } from "@/lib/api/types";
import type { VariableValues } from "@/lib/types";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";
import { resourceResponseSchema } from "@/lib/schemas/resources";
export function useSaveVariable(resource: Resource) {
  return useApiMutation({
    method: "PUT",
    path: apiPath`/resources/${resource.id}`,
    body: (values: VariableValues) => ({
      kind: resource.kind,
      name: resource.name,
      data: resource.data,
      version: resource.version,
      ...(values.encrypted
        ? { secrets: { [values.name]: values.value ?? "" } }
        : { variables: { [values.name]: values.value } }),
    }),
    schema: resourceResponseSchema,
    invalidate: [resourceKeys.all],
  });
}
