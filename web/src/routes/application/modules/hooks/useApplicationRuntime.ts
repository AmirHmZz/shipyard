import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";
import { apiPath } from "@/lib/paths";

import { applicationKeys, runtimeResponseSchema } from "../generics";
export function useApplicationRuntime(id: string) {
  return useApiQuery({
    queryKey: applicationKeys.runtime(id),
    path: apiPath`/applications/${id}/runtime`,
    schema: runtimeResponseSchema,
    refetchInterval: POLL_INTERVALS.deployment,
  });
}
