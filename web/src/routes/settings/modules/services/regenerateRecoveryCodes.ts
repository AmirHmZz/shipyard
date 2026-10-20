import type { totpPasswordSchema } from "@/lib/validation";

import { post } from "@/lib/api/client";

export function regenerateRecoveryCodes(
  payload: typeof totpPasswordSchema._output,
) {
  return post<{ secret: string; url: string }>("/auth/totp/start", payload);
}
