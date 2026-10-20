import { useQuery } from "@tanstack/react-query";

import { POLL_INTERVALS } from "@/lib/constants";
import { sessionKeys } from "@/lib/query-keys";

import { getSession } from "../services";

export function useSession() {
  return useQuery({
    queryKey: sessionKeys.all,
    queryFn: () => getSession(),
    retry: false,
    refetchInterval: POLL_INTERVALS.session,
  });
}
