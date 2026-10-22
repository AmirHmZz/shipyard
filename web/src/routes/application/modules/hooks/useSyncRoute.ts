import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { queuedResponseSchema } from "@/lib/schemas/acknowledgements";

import { applicationKeys } from "../generics";
export function useSyncRoute(routeId: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/routes/${routeId}/sync`,
    body: (payload: { mode: string }) => payload,
    schema: queuedResponseSchema,
    invalidate: [applicationKeys.domain(routeId)],
    meta: { successMessage: "Domain reconciliation queued" },
  });
}
