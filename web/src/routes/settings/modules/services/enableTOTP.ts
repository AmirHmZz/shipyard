import type { totpCodeSchema } from "@/lib/validation";

import { post } from "@/lib/api/client";

import type { TOTPRecoveryResult } from "../generics";

export function enableTOTP(payload: typeof totpCodeSchema._output) {
  return post<TOTPRecoveryResult>("/auth/totp/confirm", payload);
}
