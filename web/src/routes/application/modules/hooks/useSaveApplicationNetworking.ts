import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";
import { resourceResponseSchema } from "@/lib/schemas/resources";

import type { NetworkingSaveValues } from "../generics";

import { applicationKeys } from "../generics";
export function useSaveApplicationNetworking(appId: string) {
  return useApiMutation({
    method: "PUT",
    path: ({ published }: NetworkingSaveValues) =>
      published
        ? apiPath`/applications/${appId}/published-ports`
        : apiPath`/applications/${appId}/networking`,
    body: ({ payload }) => payload,
    schema: resourceResponseSchema,
    invalidate: [resourceKeys.all, applicationKeys.networkingPrefix(appId)],
  });
}
