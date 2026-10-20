import { useQuery } from "@tanstack/react-query";

import { POLL_INTERVALS } from "@/lib/constants";

import { settingsKeys } from "../generics";
import { getSystemUpdates } from "../services";

export function useSystemUpdates() {
  return useQuery({
    queryKey: settingsKeys.systemUpdates,
    queryFn: () => getSystemUpdates(),
    refetchInterval: POLL_INTERVALS.system,
  });
}
