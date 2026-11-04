import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import { settingsKeys } from "../generics";

export function useDeleteUser() {
  return useApiMutation({
    method: "DELETE",
    path: (id: string) => apiPath`/users/${id}`,
    schema: okResponseSchema,
    invalidate: [settingsKeys.users],
    meta: { successMessage: "User deleted" },
  });
}
