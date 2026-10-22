import type { Resource } from "@/lib/api/types";

import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";
import { grantKeys } from "@/lib/query-keys";
import { getGrantsResponseSchema } from "@/lib/schemas/endpoint-responses";
export function useGrants(resource: Resource) {
  return useApiQuery({
    queryKey: grantKeys.resource(resource.id),
    path: apiPath`/resources/${resource.id}/grants`,
    schema: getGrantsResponseSchema,
    retry: false,
  });
}
