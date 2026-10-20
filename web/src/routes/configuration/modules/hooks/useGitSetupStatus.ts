import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { configurationKeys } from "../generics";
import { getGitSetupStatus } from "../services";

export function useGitSetupStatus(existing: Resource | undefined) {
  return useQuery({
    queryKey: configurationKeys.gitSetup(existing?.id),
    queryFn: () => getGitSetupStatus(existing),
    enabled: !!existing,
  });
}
