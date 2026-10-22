import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";

import { settingsKeys, dashboardAccessResponseSchema } from "../generics";
export function useDashboardAccess() {
  return useApiQuery({
    queryKey: settingsKeys.dashboardAccess,
    path: "/settings/dashboard-access",
    schema: dashboardAccessResponseSchema,
    refetchInterval: POLL_INTERVALS.system,
  });
}
