import { dashboardKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getSetupStatus } from "../services";

export function useSetupStatus() {
  return useQuery({
    queryKey: dashboardKeys.setup,
    queryFn: () => getSetupStatus(),
  });
}
