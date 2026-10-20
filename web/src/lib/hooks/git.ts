import { useQuery } from "@tanstack/react-query";

import { branchKeys } from "@/lib/query-keys";
import { repositoryKeys } from "@/lib/query-keys";
import { getRepositories, getBranches } from "@/lib/services";

export function useRepositories(gitId: string, enabled: boolean) {
  return useQuery({
    queryKey: repositoryKeys.git(gitId),
    queryFn: ({ signal }) => getRepositories(gitId, signal),
    enabled,
    retry: false,
  });
}

export function useBranches(
  gitId: string,
  repository: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: branchKeys.repository(gitId, repository),
    queryFn: ({ signal }) => getBranches(gitId, repository, signal),
    enabled,
    retry: false,
  });
}
