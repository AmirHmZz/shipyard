import { applicationKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getDomainStatus } from "../services";
import type { Resource } from "@/lib/api";

export function useDomainStatus(route: Resource) {
  return useQuery({
    queryKey: applicationKeys.domain(route.id),
    queryFn: () => getDomainStatus(route),
    refetchInterval: 5000,
  });
}
