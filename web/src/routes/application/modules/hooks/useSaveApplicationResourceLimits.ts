import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { resourceKeys } from "@/lib/query-keys";

import type { ResourceLimitsInput } from "../generics/automation";

import {
  resourceLimitKeys,
  resourceLimitsSchema,
} from "../generics/automation";

export function useSaveApplicationResourceLimits(id: string) {
  return useApiMutation({
    method: "PUT",
    path: apiPath`/applications/${id}/resource-limits`,
    body: (values: ResourceLimitsInput) => values,
    schema: resourceLimitsSchema,
    invalidate: [resourceLimitKeys.all(id), resourceKeys.all],
    meta: { successMessage: "Resource limits saved; deploy to apply" },
  });
}
