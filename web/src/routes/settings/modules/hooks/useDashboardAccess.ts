import { settingsKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getDashboardAccess } from "../services";

export function useDashboardAccess() {
  return useQuery({
    queryKey: settingsKeys.dashboardAccess,
    queryFn: () => getDashboardAccess(),
    refetchInterval: 3000,
  });
}
