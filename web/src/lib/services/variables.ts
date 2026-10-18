import { api } from "@/lib/api/client";
import type { Resource } from "@/lib/api/types";
import { apiPath } from "@/lib/paths";

export function saveVariable(
  resource: Resource,
  values: { name: string; value: string | null; encrypted: boolean },
) {
  return api<unknown>(apiPath`/resources/${resource.id}`, {
    method: "PUT",
    body: JSON.stringify({
      kind: resource.kind,
      name: resource.name,
      data: resource.data,
      version: resource.version,
      ...(values.encrypted
        ? { secrets: { [values.name]: values.value ?? "" } }
        : { variables: { [values.name]: values.value } }),
    }),
  });
}
