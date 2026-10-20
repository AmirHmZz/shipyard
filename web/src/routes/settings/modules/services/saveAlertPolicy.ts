import type { alertPolicySchema } from "@/lib/validation";

import { api } from "@/lib/api/client";

export function saveAlertPolicy(policy: typeof alertPolicySchema._output) {
  return api<unknown>("/settings/alerts", {
    method: "PUT",
    body: JSON.stringify(policy),
  });
}
