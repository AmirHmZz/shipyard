import { post } from "@/lib/api/client";
import type { totpDisableSchema } from "@/lib/validation";

export function disableTOTP(payload: typeof totpDisableSchema._output) {
  return post<unknown>("/auth/totp/disable", payload);
}
