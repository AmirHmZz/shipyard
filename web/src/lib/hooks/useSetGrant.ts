import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { grantKeys } from "@/lib/query-keys";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";
export function useSetGrant(resourceId: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/resources/${resourceId}/grants`,
    body: (values: { teamId: string; granted: boolean }) => values,
    schema: okResponseSchema,
    invalidate: [grantKeys.resource(resourceId)],
  });
}
