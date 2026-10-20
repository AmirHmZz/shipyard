import { useQuery } from "@tanstack/react-query";

import { POLL_INTERVALS } from "@/lib/constants";

import { serverDeletionKeys } from "../generics";
import { getServerDeletionStatus } from "../services";

export function useServerDeletionStatus(id: string, enabled: boolean) {
  return useQuery({
    queryKey: serverDeletionKeys.status(id),
    queryFn: () => getServerDeletionStatus(id),
    enabled: enabled,
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.done ? false : POLL_INTERVALS.active,
  });
}
