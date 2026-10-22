import type { Resource } from "@/lib/api/types";

import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";
import { resourceKeys } from "@/lib/query-keys";
import { getResourcesResponseSchema } from "@/lib/schemas/endpoint-responses";
export function useResources<T = Resource[]>(
  select?: (resources: Resource[]) => T,
) {
  return useApiQuery({
    queryKey: resourceKeys.all,
    path: "/resources",
    schema: getResourcesResponseSchema,
    select,
    refetchInterval: POLL_INTERVALS.resources,
  });
}
