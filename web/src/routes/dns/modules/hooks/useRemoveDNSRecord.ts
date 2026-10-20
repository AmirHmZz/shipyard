import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import { dnsKeys } from "../generics";

export function useRemoveDNSRecord(zoneId: string) {
  return useApiMutation({
    method: "DELETE",
    path: (recordId: string) => apiPath`/zones/${zoneId}/records/${recordId}`,
    body: () => ({}),
    schema: okResponseSchema,
    invalidate: [dnsKeys.records(zoneId)],
  });
}
