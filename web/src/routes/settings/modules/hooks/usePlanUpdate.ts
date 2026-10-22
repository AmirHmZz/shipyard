import { useApiMutation } from "@/lib/api/use-api-mutation";

import { versionChangePlanResponseSchema, settingsKeys } from "../generics";
export function usePlanUpdate() {
  return useApiMutation({
    mutationKey: settingsKeys.updatePlan,
    gcTime: Infinity,
    method: "POST",
    path: "/settings/updates/plan",
    body: (values: { target: string }) => values,
    schema: versionChangePlanResponseSchema,
    invalidate: [settingsKeys.systemUpdates],
  });
}
