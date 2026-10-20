import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";

import { settingsKeys, historyResponseSchema } from "../generics";
export function useHistory(type: "audit" | "jobs") {
  return useApiQuery({
    queryKey: settingsKeys.history(type),
    path: `/${type}`,
    schema: historyResponseSchema,
    refetchInterval: POLL_INTERVALS.history,
  });
}
