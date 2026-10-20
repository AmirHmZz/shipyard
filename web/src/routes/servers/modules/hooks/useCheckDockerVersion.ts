import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { metricsKeys } from "@/lib/query-keys";

import { dockerVersionResultResponseSchema } from "../generics";

export function useCheckDockerVersion(serverId: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/servers/${serverId}/test`,
    body: () => ({}),
    schema: dockerVersionResultResponseSchema,
    invalidate: [metricsKeys.all],
  });
}
