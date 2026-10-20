import type * as z from "zod/mini";

import { post } from "@/lib/api/client";

import type { totpPasswordSchema } from "../generics";

export function regenerateRecoveryCodes(
  payload: z.output<typeof totpPasswordSchema>,
) {
  return post<{ secret: string; url: string }>("/auth/totp/start", payload);
}
