import { post } from "@/lib/api/client";
import type { updateFormSchema } from "@/lib/validation";

export function applyUpdate(
  payload: ReturnType<typeof updateFormSchema>["_output"],
) {
  return post<unknown>("/settings/updates", payload);
}
