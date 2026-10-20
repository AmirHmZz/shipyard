import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";

import {
  gitWebhookSecretResultResponseSchema,
  configurationKeys,
} from "../generics";
export function useCreateGitWebhook(id: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/git/${id}/webhook-secret`,
    body: () => ({}),
    schema: gitWebhookSecretResultResponseSchema,
    invalidate: [resourceKeys.all, configurationKeys.gitSetup(id)],
  });
}
