import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";
import { branchKeys } from "@/lib/query-keys";
import { getBranchesResponseSchema } from "@/lib/schemas/endpoint-responses";
export function useBranches(
  gitId: string,
  repository: string,
  enabled: boolean,
) {
  return useApiQuery({
    queryKey: branchKeys.repository(gitId, repository),
    path: `${apiPath`/git/${gitId}/branches`}?repository=${encodeURIComponent(repository)}`,
    schema: getBranchesResponseSchema,
    enabled,
    retry: false,
  });
}
