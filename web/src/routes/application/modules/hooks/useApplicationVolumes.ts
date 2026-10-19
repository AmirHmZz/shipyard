import { useQuery } from "@tanstack/react-query";
import { applicationKeys } from "../generics";
import { getApplicationVolumes } from "../services";

export function useApplicationVolumes(id: string, enabled: boolean) {
  return useQuery({
    queryKey: applicationKeys.volumes(id),
    queryFn: () => getApplicationVolumes(id),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}
