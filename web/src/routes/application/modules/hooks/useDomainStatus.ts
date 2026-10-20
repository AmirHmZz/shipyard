import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { POLL_INTERVALS } from "@/lib/constants";

import { applicationKeys } from "../generics";
import { getDomainStatus } from "../services";

export function useDomainStatus(route: Resource) {
  return useQuery({
    queryKey: applicationKeys.domain(route.id),
    queryFn: () => getDomainStatus(route),
    refetchInterval: POLL_INTERVALS.deployment,
  });
}
