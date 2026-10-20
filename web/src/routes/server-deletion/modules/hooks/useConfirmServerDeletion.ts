import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";

import type { ServerDeletionConfirmation } from "../generics";

import {
  serverDeletionKeys,
  serverDeletionQueuedResponseSchema,
} from "../generics";
export function useConfirmServerDeletion(id: string) {
  return useApiMutation({
    method: "DELETE",
    path: apiPath`/servers/${id}`,
    body: (confirmation: ServerDeletionConfirmation) => confirmation,
    schema: serverDeletionQueuedResponseSchema,
    invalidate: [resourceKeys.all, serverDeletionKeys.status(id)],
  });
}
