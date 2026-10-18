import { api } from "@/lib/api/client";
import type { alertPolicySchema } from "@/lib/validation";

export function saveAlertPolicy(policy: typeof alertPolicySchema._output) {
  return api<unknown>("/settings/alerts", {
    method: "PUT",
    body: JSON.stringify(policy),
  });
}
