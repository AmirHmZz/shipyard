import type * as z from "zod/mini";

import { post } from "@/lib/api/client";

import type { totpDisableSchema } from "../generics";

export function disableTOTP(payload: z.output<typeof totpDisableSchema>) {
  return post<unknown>("/auth/totp/disable", payload);
}
