import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";

import type { HAProxyValues } from "../generics";

import {
  haProxyUpdateResultResponseSchema,
  configurationKeys,
} from "../generics";
export function useSaveHAProxySettings(id: string) {
  return useApiMutation({
    method: "PUT",
    path: apiPath`/servers/${id}/haproxy`,
    body: (values: HAProxyValues) => values,
    schema: haProxyUpdateResultResponseSchema,
    invalidate: [configurationKeys.haproxy(id)],
  });
}
