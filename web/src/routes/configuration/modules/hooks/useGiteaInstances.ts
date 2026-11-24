import { useApiQuery } from "@/lib/api/use-api-query";

import {
  configurationKeys,
  getGiteaInstancesResponseSchema,
} from "../generics";

export function useGiteaInstances(
  provider: string,
  teamId = "",
  enabled = true,
) {
  const query = teamId ? `?${new URLSearchParams({ teamId })}` : "";
  return useApiQuery({
    queryKey: [...configurationKeys.giteaInstances, teamId],
    path: `/git/gitea/instances${query}`,
    schema: getGiteaInstancesResponseSchema,
    enabled: enabled && provider === "gitea",
  });
}
