import { useApiMutation } from "@/lib/api/use-api-mutation";
import { sessionKeys } from "@/lib/query-keys";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import type { TOTPDisableValues } from "../generics";
export function useDisableTOTP() {
  return useApiMutation({
    method: "POST",
    path: "/auth/totp/disable",
    body: (values: TOTPDisableValues) => values,
    schema: okResponseSchema,
    invalidate: [sessionKeys.all],
    meta: { successMessage: "Authenticator disabled" },
  });
}
