import type { totpDisableSchema } from "@/lib/validation";

import { post } from "@/lib/api/client";

export function disableTOTP(payload: typeof totpDisableSchema._output) {
  return post<unknown>("/auth/totp/disable", payload);
}
