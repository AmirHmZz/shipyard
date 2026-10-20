import { useQuery } from "@tanstack/react-query";

import { dashboardKeys } from "../generics";
import { getSetupStatus } from "../services";

export function useSetupStatus() {
  return useQuery({
    queryKey: dashboardKeys.setup,
    queryFn: () => getSetupStatus(),
  });
}
