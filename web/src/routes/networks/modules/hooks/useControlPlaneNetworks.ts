import { useApiQuery } from "@/lib/api/use-api-query";
import { controlPlaneNetworkKeys } from "@/lib/query-keys";

import { controlPlaneNetworksSchema } from "../generics";

export function useControlPlaneNetworks(enabled: boolean) {
  return useApiQuery({
    queryKey: controlPlaneNetworkKeys.all,
    path: "/settings/control-plane-networks",
    schema: controlPlaneNetworksSchema,
    enabled,
    refetchInterval: 15000,
  });
}
