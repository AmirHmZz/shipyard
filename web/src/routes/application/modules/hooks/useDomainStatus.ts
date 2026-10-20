import type { Resource } from "@/lib/api/types";

import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";
import { apiPath } from "@/lib/paths";

import { applicationKeys, domainStatusResponseSchema } from "../generics";
export function useDomainStatus(route: Resource) {
  return useApiQuery({
    queryKey: applicationKeys.domain(route.id),
    path: apiPath`/routes/${route.id}/status`,
    schema: domainStatusResponseSchema,
    refetchInterval: POLL_INTERVALS.deployment,
  });
}
