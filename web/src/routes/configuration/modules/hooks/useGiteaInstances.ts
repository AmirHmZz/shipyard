import { useApiQuery } from "@/lib/api/use-api-query";

import {
  configurationKeys,
  getGiteaInstancesResponseSchema,
} from "../generics";

export function useGiteaInstances(provider: string) {
  return useApiQuery({
    queryKey: configurationKeys.giteaInstances,
    path: "/git/gitea/instances",
    schema: getGiteaInstancesResponseSchema,
    enabled: provider === "gitea",
  });
}
