import type * as z from "zod/mini";

import { post } from "@/lib/api/client";

import type { updateFormSchema } from "../generics";

export function applyUpdate(
  payload: z.output<ReturnType<typeof updateFormSchema>>,
) {
  return post<unknown>("/settings/updates", payload);
}
