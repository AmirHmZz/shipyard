import { useApiMutation } from "@/lib/api/use-api-mutation";

import { systemUpdatesResponseSchema, settingsKeys } from "../generics";
export function useCheckForUpdates() {
  return useApiMutation({
    method: "POST",
    path: "/settings/updates/check",
    body: () => ({}),
    schema: systemUpdatesResponseSchema,
    invalidate: [settingsKeys.systemUpdates],
  });
}
