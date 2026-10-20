import { useApiMutation } from "@/lib/api/use-api-mutation";
import { jobResponseSchema } from "@/lib/schemas/acknowledgements";

import type { DashboardAccessValues } from "../generics";

import { settingsKeys } from "../generics";
export function useSaveDashboardAccess() {
  return useApiMutation({
    method: ({ retry }: DashboardAccessValues) => (retry ? "POST" : "PUT"),
    path: ({ retry }) => "/settings/dashboard-access" + (retry ? "/retry" : ""),
    body: ({ payload }) => payload,
    schema: jobResponseSchema,
    invalidate: [settingsKeys.dashboardAccess],
  });
}
