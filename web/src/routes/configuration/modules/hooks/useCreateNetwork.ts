import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys, dockerNetworkKeys } from "@/lib/query-keys";
import { resourceResponseSchema } from "@/lib/schemas/resources";

import type { NewNetworkValues } from "../generics";
export function useCreateNetwork(server: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/servers/${server}/networks`,
    body: (network: NewNetworkValues) => network,
    schema: resourceResponseSchema,
    invalidate: [resourceKeys.all, dockerNetworkKeys.all],
  });
}
