import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { applicationKeys } from "../generics";
import { getDomainStatus } from "../services";

export function useDomainStatus(route: Resource) {
  return useQuery({
    queryKey: applicationKeys.domain(route.id),
    queryFn: () => getDomainStatus(route),
    refetchInterval: 5000,
  });
}
