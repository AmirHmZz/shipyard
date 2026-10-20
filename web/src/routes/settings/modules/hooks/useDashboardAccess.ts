import { useQuery } from "@tanstack/react-query";

import { POLL_INTERVALS } from "@/lib/constants";

import { settingsKeys } from "../generics";
import { getDashboardAccess } from "../services";

export function useDashboardAccess() {
  return useQuery({
    queryKey: settingsKeys.dashboardAccess,
    queryFn: () => getDashboardAccess(),
    refetchInterval: POLL_INTERVALS.system,
  });
}
