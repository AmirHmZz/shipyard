import type { Resource } from "@/lib/api/types";

import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import {
  applicationKeys,
  applicationNetworkingResponseSchema,
} from "../generics";
export function useApplicationNetworking(app: Resource) {
  return useApiQuery({
    queryKey: applicationKeys.networking(app.id, app.version),
    path: apiPath`/applications/${app.id}/networking`,
    schema: applicationNetworkingResponseSchema,
  });
}
