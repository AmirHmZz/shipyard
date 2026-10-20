import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";
import { sessionKeys } from "@/lib/query-keys";
import { sessionOrSignedOutResponseSchema } from "@/lib/schemas/session";

export function useSession() {
  return useApiQuery({
    queryKey: sessionKeys.all,
    path: "/auth/me",
    schema: sessionOrSignedOutResponseSchema,
    retry: false,
    refetchInterval: POLL_INTERVALS.session,
  });
}
