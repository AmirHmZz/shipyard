import { useApiMutation } from "@/lib/api/use-api-mutation";
import { sessionKeys } from "@/lib/query-keys";
import { sessionResponseSchema } from "@/lib/schemas/session";

import type { PasswordValues } from "../generics";
export function useChangePassword() {
  return useApiMutation({
    method: "POST",
    path: "/auth/password",
    body: (values: PasswordValues) => values,
    schema: sessionResponseSchema,
    meta: { successMessage: "Password changed" },
    onSuccess: (session, _variables, _snapshot, context) => {
      context.client.setQueryData(sessionKeys.all, session);
    },
  });
}
