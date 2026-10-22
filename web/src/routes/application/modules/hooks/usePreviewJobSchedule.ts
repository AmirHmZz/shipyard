import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import { jobKeys, jobSettingsSchema } from "../generics/jobs";
export function usePreviewJobSchedule(
  id: string,
  cron: string,
  timezone: string,
) {
  return useApiQuery({
    queryKey: jobKeys.preview(id, cron, timezone),
    path:
      apiPath`/applications/${id}/job-settings` +
      "?" +
      new URLSearchParams({ cron, timezone }),
    schema: jobSettingsSchema,
    enabled: !!cron && !!timezone,
    retry: false,
  });
}
