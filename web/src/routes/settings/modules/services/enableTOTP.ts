import { post } from "@/lib/api/client";
import type { TOTPRecoveryResult } from "../generics";
import type { totpCodeSchema } from "@/lib/validation";

export function enableTOTP(payload: typeof totpCodeSchema._output) {
  return post<TOTPRecoveryResult>("/auth/totp/confirm", payload);
}
