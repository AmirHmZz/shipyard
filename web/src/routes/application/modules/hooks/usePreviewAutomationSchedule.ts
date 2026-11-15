import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import { automationKeys, schedulePreviewSchema } from "../generics/automation";

export function usePreviewAutomationSchedule(
  id: string,
  cron: string,
  timezone: string,
) {
  return useApiQuery({
    queryKey: automationKeys.preview(id, cron, timezone),
    path:
      apiPath`/applications/${id}/automation/preview` +
      "?" +
      new URLSearchParams({ cron, timezone }),
    schema: schedulePreviewSchema,
    enabled: !!cron && !!timezone,
    retry: false,
  });
}
