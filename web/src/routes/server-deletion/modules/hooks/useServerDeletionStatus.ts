import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";
import { apiPath } from "@/lib/paths";

import {
  serverDeletionKeys,
  serverDeletionStatusResponseSchema,
} from "../generics";

export function useServerDeletionStatus(id: string, enabled: boolean) {
  return useApiQuery({
    queryKey: serverDeletionKeys.status(id),
    path: apiPath`/servers/${id}/deletion`,
    schema: serverDeletionStatusResponseSchema,
    enabled: enabled,
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.done ? false : POLL_INTERVALS.active,
  });
}
