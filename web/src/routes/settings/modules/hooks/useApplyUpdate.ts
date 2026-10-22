import { useApiMutation } from "@/lib/api/use-api-mutation";

import type { UpdateValues } from "../generics";

import {
  versionChangeOperationResponseSchema,
  settingsKeys,
} from "../generics";
export function useApplyUpdate() {
  return useApiMutation({
    method: "POST",
    path: "/settings/updates",
    body: (values: UpdateValues) => values,
    schema: versionChangeOperationResponseSchema,
    invalidate: [settingsKeys.systemUpdates],
  });
}
