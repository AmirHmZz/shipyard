import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import type { UserAccessVariables } from "../generics";

import { settingsKeys } from "../generics";
export function useUpdateUser() {
  return useApiMutation({
    method: "PUT",
    path: ({ id }: UserAccessVariables) => apiPath`/users/${String(id)}`,
    body: ({ access }) => access,
    schema: okResponseSchema,
    invalidate: [settingsKeys.users],
    meta: { successMessage: "User access updated" },
  });
}
