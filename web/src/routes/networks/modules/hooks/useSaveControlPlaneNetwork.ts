import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { controlPlaneNetworkKeys, dockerNetworkKeys } from "@/lib/query-keys";

import { controlPlaneNetworkSchema } from "../generics";

export function useSaveControlPlaneNetwork() {
  return useApiMutation({
    method: "PUT",
    path: (input: { networkId: string; attached: boolean }) =>
      apiPath`/networks/${input.networkId}/control-plane`,
    body: (input) => ({ attached: input.attached }),
    schema: controlPlaneNetworkSchema,
    invalidate: [controlPlaneNetworkKeys.all, dockerNetworkKeys.all],
  });
}
