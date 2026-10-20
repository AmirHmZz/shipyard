import type { Resource } from "@/lib/api/types";

import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import { applicationKeys, composeSourceResponseSchema } from "../generics";
export function useComposeSource(app: Resource) {
  return useApiQuery({
    queryKey: applicationKeys.composeSource(app.id, app.version),
    path: apiPath`/applications/${app.id}/compose`,
    schema: composeSourceResponseSchema,
    enabled: app.canWrite,
  });
}
