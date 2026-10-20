import { useApiMutation } from "@/lib/api/use-api-mutation";
import { sessionKeys } from "@/lib/query-keys";

import type { TOTPCodeValues } from "../generics";

import { totpRecoveryResultResponseSchema } from "../generics";
export function useEnableTOTP() {
  return useApiMutation({
    method: "POST",
    path: "/auth/totp/confirm",
    body: (values: TOTPCodeValues) => values,
    schema: totpRecoveryResultResponseSchema,
    invalidate: [sessionKeys.all],
    meta: { successMessage: "Authenticator enabled" },
  });
}
