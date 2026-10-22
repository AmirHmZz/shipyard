import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";

import type { ComposeSourceValues } from "../generics";

import { composeSourceResponseSchema } from "../generics";
export function useSaveComposeSource(appId: string) {
  return useApiMutation({
    method: "PUT",
    path: apiPath`/applications/${appId}/compose`,
    body: (payload: ComposeSourceValues) => payload,
    schema: composeSourceResponseSchema,
    invalidate: [resourceKeys.all],
  });
}
