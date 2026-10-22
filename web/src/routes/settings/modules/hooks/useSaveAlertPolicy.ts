import { useApiMutation } from "@/lib/api/use-api-mutation";

import type { AlertPolicyValues } from "../generics";

import { alertPolicyResponseSchema, settingsKeys } from "../generics";
export function useSaveAlertPolicy() {
  return useApiMutation({
    method: "PUT",
    path: "/settings/alerts",
    body: (values: AlertPolicyValues) => values,
    schema: alertPolicyResponseSchema,
    invalidate: [settingsKeys.alertPolicy],
    meta: { successMessage: "Alert policy saved" },
  });
}
