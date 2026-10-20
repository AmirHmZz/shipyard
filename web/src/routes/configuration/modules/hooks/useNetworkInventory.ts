import { useQuery } from "@tanstack/react-query";

import { dockerNetworkKeys } from "@/lib/query-keys";

import { getNetworkInventory } from "../services";

export function useNetworkInventory(server: string, admin: boolean) {
  return useQuery({
    queryKey: dockerNetworkKeys.server(server),
    queryFn: () => getNetworkInventory(server),
    enabled: !!server && !!admin,
    retry: false,
  });
}
