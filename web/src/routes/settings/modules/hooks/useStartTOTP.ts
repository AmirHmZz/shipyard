import { useApiMutation } from "@/lib/api/use-api-mutation";

import type { TOTPPasswordValues } from "../generics";

import { regenerateRecoveryCodesResponseSchema } from "../generics";
export function useStartTOTP() {
  return useApiMutation({
    method: "POST",
    path: "/auth/totp/start",
    body: (values: TOTPPasswordValues) => values,
    schema: regenerateRecoveryCodesResponseSchema,
  });
}
