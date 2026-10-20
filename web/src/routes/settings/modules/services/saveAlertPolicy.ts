import type * as z from "zod/mini";

import { api } from "@/lib/api/client";

import type { alertPolicySchema } from "../generics";

export function saveAlertPolicy(policy: z.output<typeof alertPolicySchema>) {
  return api<unknown>("/settings/alerts", {
    method: "PUT",
    body: JSON.stringify(policy),
  });
}
