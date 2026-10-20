import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api/types";

import { resourceKeys } from "@/lib/query-keys";
import { getResources } from "@/lib/services";
export function useResources<T = Resource[]>(
  select?: (resources: Resource[]) => T,
) {
  return useQuery({
    select,
    queryKey: resourceKeys.all,
    queryFn: getResources,
    refetchInterval: 15000,
  });
}
