import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";
import { grantKeys } from "@/lib/query-keys";
import { zoneGrantsSchema } from "@/lib/schemas/hostname-grants";

export function useZoneGrants(zoneId: string) {
  return useApiQuery({
    queryKey: grantKeys.zone(zoneId),
    path: apiPath`/zones/${zoneId}/grants`,
    schema: zoneGrantsSchema,
  });
}
