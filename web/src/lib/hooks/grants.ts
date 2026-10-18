import { grantKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import type { Resource } from "@/lib/api";
import { getGrants } from "@/lib/services";

export function useGrants(resource: Resource) {
  return useQuery({
    queryKey: grantKeys.resource(resource.id),
    queryFn: () => getGrants(resource.id),
    retry: false,
  });
}
