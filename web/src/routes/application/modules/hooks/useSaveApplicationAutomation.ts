import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";

import type { AutomationSettings } from "../generics/automation";

import { automationKeys, automationStatusSchema } from "../generics/automation";

export function useSaveApplicationAutomation(id: string) {
  return useApiMutation({
    method: "PUT",
    path: apiPath`/applications/${id}/automation`,
    body: (values: AutomationSettings) => values,
    schema: automationStatusSchema,
    invalidate: [automationKeys.settings(id)],
    meta: { successMessage: "Automation settings saved" },
  });
}
