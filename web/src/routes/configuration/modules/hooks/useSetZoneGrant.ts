import type { ZoneGrantInput } from "@/lib/schemas/hostname-grants";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { grantKeys, resourceKeys } from "@/lib/query-keys";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

export function useSetZoneGrant(zoneId: string, teamId: string) {
  return useApiMutation({
    method: "PUT",
    path: apiPath`/zones/${zoneId}/grants/${teamId}`,
    body: (grant: ZoneGrantInput) => grant,
    schema: okResponseSchema,
    invalidate: [
      grantKeys.zone(zoneId),
      grantKeys.resource(zoneId),
      grantKeys.applications,
      resourceKeys.all,
    ],
    meta: { successMessage: "Team domain access saved." },
  });
}
