import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { deploymentKeys } from "@/lib/query-keys";

import { deploymentCreationResultResponseSchema } from "../generics";
export function useDeployComposeSource(appId: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/applications/${appId}/deploy`,
    body: (payload: { version: number }) => payload,
    schema: deploymentCreationResultResponseSchema,
    invalidate: [deploymentKeys.all],
  });
}
