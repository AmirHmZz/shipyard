import type { Resource } from "@/lib/api/types";

import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import { configurationKeys, gitSetupStatusResponseSchema } from "../generics";

export function useGitSetupStatus(existing: Resource | undefined) {
  return useApiQuery({
    queryKey: configurationKeys.gitSetup(existing?.id),
    path: apiPath`/git/${existing?.id}/setup`,
    schema: gitSetupStatusResponseSchema,
    enabled: !!existing,
  });
}
