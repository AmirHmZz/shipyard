import { api } from "@/lib/api/client";
import type { Resource } from "@/lib/api/types";
import { apiPath } from "@/lib/paths";
import type { parseResourceForm } from "@/lib/validation";

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
