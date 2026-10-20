import { useApiQuery } from "@/lib/api/use-api-query";

import { settingsKeys, alertPolicyResponseSchema } from "../generics";
export function useAlertPolicy() {
  return useApiQuery({
    queryKey: settingsKeys.alertPolicy,
    path: "/settings/alerts",
    schema: alertPolicyResponseSchema,
  });
}
