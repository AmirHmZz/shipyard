import { applicationKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getApplicationReleases } from "../services";

export function useApplicationReleases(id: string, enabled: boolean) {
  return useQuery({
    queryKey: applicationKeys.releases(id),
    enabled: enabled,
    queryFn: () => getApplicationReleases(id),
    refetchInterval: 10000,
  });
}
