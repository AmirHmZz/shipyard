import type * as z from "zod/mini";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { serverDeletionSchema } from "../generics";

export function confirmServerDeletion(
  id: string,
  payload: z.output<ReturnType<typeof serverDeletionSchema>>,
) {
  return api<unknown>(apiPath`/servers/${id}`, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}
