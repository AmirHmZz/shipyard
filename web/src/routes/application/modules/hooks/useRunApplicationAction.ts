import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { deploymentKeys } from "@/lib/query-keys";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import { applicationKeys } from "../generics";
export function useRunApplicationAction(id: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/applications/${id}/action`,
    body: (action: string) => ({ action }),
    schema: okResponseSchema,
    invalidate: [applicationKeys.runtime(id), deploymentKeys.list(id)],
  });
}
