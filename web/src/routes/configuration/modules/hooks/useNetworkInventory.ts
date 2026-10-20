import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";
import { dockerNetworkKeys } from "@/lib/query-keys";

import { dockerNetworkInventoryResponseSchema } from "../generics";

export function useNetworkInventory(server: string, admin: boolean) {
  return useApiQuery({
    queryKey: dockerNetworkKeys.server(server),
    path: apiPath`/servers/${server}/networks`,
    schema: dockerNetworkInventoryResponseSchema,
    enabled: !!server && !!admin,
    retry: false,
  });
}
