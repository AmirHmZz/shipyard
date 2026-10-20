import type * as z from "zod/mini";

import { post } from "@/lib/api/client";

import type { totpCodeSchema } from "../generics";
import type { TOTPRecoveryResult } from "../generics";

export function enableTOTP(payload: z.output<typeof totpCodeSchema>) {
  return post<TOTPRecoveryResult>("/auth/totp/confirm", payload);
}
