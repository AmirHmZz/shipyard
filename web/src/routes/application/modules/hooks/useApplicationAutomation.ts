import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import { automationKeys, automationStatusSchema } from "../generics/automation";

export function useApplicationAutomation(id: string) {
  return useApiQuery({
    queryKey: automationKeys.settings(id),
    path: apiPath`/applications/${id}/automation`,
    schema: automationStatusSchema,
    refetchInterval: 10000,
  });
}
