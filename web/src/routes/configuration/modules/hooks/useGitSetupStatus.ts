import { configurationKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getGitSetupStatus } from "../services";
import type { Resource } from "@/lib/api";

export function useGitSetupStatus(existing: Resource | undefined) {
  return useQuery({
    queryKey: configurationKeys.gitSetup(existing?.id),
    queryFn: () => getGitSetupStatus(existing),
    enabled: !!existing,
  });
}
