import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import {
  resourceLimitKeys,
  resourceLimitsSchema,
} from "../generics/automation";

export function useApplicationResourceLimits(id: string) {
  return useApiQuery({
    queryKey: resourceLimitKeys.all(id),
    path: apiPath`/applications/${id}/resource-limits`,
    schema: resourceLimitsSchema,
  });
}
