import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";
import { repositoryKeys } from "@/lib/query-keys";
import { getRepositoriesResponseSchema } from "@/lib/schemas/endpoint-responses";
export function useRepositories(gitId: string, enabled: boolean) {
  return useApiQuery({
    queryKey: repositoryKeys.git(gitId),
    path: apiPath`/git/${gitId}/repositories`,
    schema: getRepositoriesResponseSchema,
    enabled,
    retry: false,
  });
}
