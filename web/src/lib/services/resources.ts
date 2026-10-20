import type { Resource } from "@/lib/api/types";
import type { parseResourceForm } from "@/lib/schemas/resource-form";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function saveResource(
  existingId: string | undefined,
  kind: string,
  payload: ReturnType<typeof parseResourceForm>,
) {
  return api<Resource>(
    existingId ? apiPath`/resources/${existingId}` : "/resources",
    {
      method: existingId ? "PUT" : "POST",
      body: JSON.stringify(
        kind === "route" ? { ...payload, name: undefined } : payload,
      ),
    },
  );
}

export function deleteResource(id: string) {
  return api<unknown>(apiPath`/resources/${id}`, {
    method: "DELETE",
    body: "{}",
  });
}

export function getResources() {
  return api<Resource[]>("/resources");
}
