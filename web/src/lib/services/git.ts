import type * as z from "zod/mini";

import type { branchOptionResponseSchema } from "@/lib/schemas/branch-option";
import type { repositoryOptionResponseSchema } from "@/lib/schemas/repository-option";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

// TODO(openapi): add the option response shapes to the generated schema.

export type RepositoryOption = z.infer<typeof repositoryOptionResponseSchema>;

export type BranchOption = z.infer<typeof branchOptionResponseSchema>;

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
