import { useQuery } from "@tanstack/react-query";

import { dockerNetworkKeys } from "@/lib/query-keys";

import { getDockerNetworks } from "../services";

export function useDockerNetworks(filter: string, enabled: boolean) {
  return useQuery({
    queryKey: dockerNetworkKeys.filter(filter),
    queryFn: () => getDockerNetworks(filter),
    enabled: enabled,
    retry: false,
  });
}
