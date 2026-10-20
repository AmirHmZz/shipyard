import type { Resource } from "@/lib/api/types";

import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";
import { applicationServiceKeys } from "@/lib/query-keys";

import { applicationServicesResponseSchema } from "../generics";
export function useApplicationServices(app: Resource) {
  return useApiQuery({
    queryKey: applicationServiceKeys.version(app.id, app.version),
    path: apiPath`/applications/${app.id}/services`,
    schema: applicationServicesResponseSchema,
    enabled: app.canWrite,
    retry: false,
  });
}
