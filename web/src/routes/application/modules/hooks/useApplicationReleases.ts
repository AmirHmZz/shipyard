import { useQuery } from "@tanstack/react-query";

import { POLL_INTERVALS } from "@/lib/constants";

import { applicationKeys } from "../generics";
import { getApplicationReleases } from "../services";

export function useApplicationReleases(id: string, enabled: boolean) {
  return useQuery({
    queryKey: applicationKeys.releases(id),
    enabled: enabled,
    queryFn: () => getApplicationReleases(id),
    refetchInterval: POLL_INTERVALS.history,
  });
}
