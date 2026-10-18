import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

// TODO(openapi): add the option response shapes to the generated schema.

export type RepositoryOption = { full_name: string };

export type BranchOption = { name: string };

export function getRepositories(gitId: string, signal: AbortSignal) {
  return api<RepositoryOption[]>(apiPath`/git/${gitId}/repositories`, {
    signal,
  });
}

export function getBranches(
  gitId: string,
  repository: string,
  signal: AbortSignal,
) {
  return api<BranchOption[]>(
    `${apiPath`/git/${gitId}/branches`}?repository=${encodeURIComponent(repository)}`,
    { signal },
  );
}
