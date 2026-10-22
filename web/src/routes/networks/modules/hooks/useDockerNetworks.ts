import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";
import { dockerNetworkKeys } from "@/lib/query-keys";

import { getDockerNetworksResponseSchema } from "../generics";

export function useDockerNetworks(filter: string, enabled: boolean) {
  return useApiQuery({
    queryKey: dockerNetworkKeys.filter(filter),
    path: apiPath`/servers/${filter}/networks`,
    schema: getDockerNetworksResponseSchema,
    enabled: enabled,
    retry: false,
  });
}
