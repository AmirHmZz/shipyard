import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import { jobKeys, jobSettingsSchema } from "../generics/jobs";
export function useJobSettings(id: string) {
  return useApiQuery({
    queryKey: jobKeys.settings(id),
    path: apiPath`/applications/${id}/job-settings`,
    schema: jobSettingsSchema,
    refetchInterval: 5000,
  });
}
