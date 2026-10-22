import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import { applicationKeys, applicationVolumesResponseSchema } from "../generics";
export function useApplicationVolumes(id: string, enabled: boolean) {
  return useApiQuery({
    queryKey: applicationKeys.volumes(id),
    path: apiPath`/applications/${id}/volumes`,
    schema: applicationVolumesResponseSchema,
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}
