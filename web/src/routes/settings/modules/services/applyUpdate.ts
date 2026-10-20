import type { updateFormSchema } from "@/lib/validation";

import { post } from "@/lib/api/client";

export function applyUpdate(
  payload: ReturnType<typeof updateFormSchema>["_output"],
) {
  return post<unknown>("/settings/updates", payload);
}
