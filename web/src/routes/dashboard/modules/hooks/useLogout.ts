import { useApiMutation } from "@/lib/api/use-api-mutation";
import { sessionKeys } from "@/lib/query-keys";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

export function useLogout() {
  return useApiMutation({
    method: "POST",
    path: "/auth/logout",
    body: () => ({}),
    schema: okResponseSchema,
    onSuccess: async (_data, _variables, _snapshot, context) => {
      await context.client.cancelQueries();
      context.client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      context.client.setQueryData(sessionKeys.all, null);
    },
  });
}
