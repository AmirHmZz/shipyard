import { useApiQuery } from "@/lib/api/use-api-query";

import { configurationKeys, gitSetupConfigResponseSchema } from "../generics";

export function useGitSetupConfig(enabled = true) {
  return useApiQuery({
    queryKey: configurationKeys.gitSetupConfig,
    path: "/git/setup/config",
    schema: gitSetupConfigResponseSchema,
    enabled,
  });
}
