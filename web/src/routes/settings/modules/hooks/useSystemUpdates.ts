import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";

import { settingsKeys, systemUpdatesResponseSchema } from "../generics";
export function useSystemUpdates() {
  return useApiQuery({
    queryKey: settingsKeys.systemUpdates,
    path: "/settings/updates",
    schema: systemUpdatesResponseSchema,
    refetchInterval: POLL_INTERVALS.system,
  });
}
