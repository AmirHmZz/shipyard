import type { Resource } from "@/lib/api";

import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";
import { apiPath } from "@/lib/paths";

import { configurationKeys, haProxySettingsResponseSchema } from "../generics";

export function useHAProxySettings(server: Resource) {
  return useApiQuery({
    queryKey: configurationKeys.haproxy(server.id),
    path: apiPath`/servers/${server.id}/haproxy`,
    schema: haProxySettingsResponseSchema,
    refetchInterval: POLL_INTERVALS.active,
  });
}
