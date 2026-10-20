import type { serverDeletionSchema } from "@/lib/validation";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function confirmServerDeletion(
  id: string,
  payload: ReturnType<typeof serverDeletionSchema>["_output"],
) {
  return api<unknown>(apiPath`/servers/${id}`, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}
