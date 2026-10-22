import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { deploymentKeys } from "@/lib/query-keys";

import type { FreshDeployValues } from "../generics";

import { deploymentCreationResultResponseSchema } from "../generics";
export function useCreateDeployment(id: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/applications/${id}/deploy`,
    body: (payload: FreshDeployValues | Record<string, never>) => payload,
    schema: deploymentCreationResultResponseSchema,
    invalidate: [deploymentKeys.all],
  });
}
