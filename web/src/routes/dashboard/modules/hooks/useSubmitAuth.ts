import { useApiMutation } from "@/lib/api/use-api-mutation";
import { resourceKeys, sessionKeys } from "@/lib/query-keys";
import { sessionResponseSchema } from "@/lib/schemas/session";

import type { AuthValues } from "../generics";

export function useSubmitAuth(mode: "accept" | "login" | "setup") {
  return useApiMutation({
    method: "POST",
    path: `/auth/${mode}`,
    body: (values: AuthValues) => values,
    schema: sessionResponseSchema,
    onSuccess: (session, _variables, _snapshot, context) => {
      context.client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      context.client.setQueryData(sessionKeys.all, session);
      return context.client.invalidateQueries({ queryKey: resourceKeys.all });
    },
  });
}
