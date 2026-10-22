import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";
import { apiPath } from "@/lib/paths";

import {
  applicationKeys,
  applicationReleasesResponseSchema,
} from "../generics";
export function useApplicationReleases(id: string, enabled: boolean) {
  return useApiQuery({
    queryKey: applicationKeys.releases(id),
    path: apiPath`/applications/${id}/releases`,
    schema: applicationReleasesResponseSchema,
    enabled,
    refetchInterval: POLL_INTERVALS.history,
  });
}
