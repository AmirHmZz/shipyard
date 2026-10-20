import { useQuery } from "@tanstack/react-query";

import { applicationKeys } from "../generics";
import { getSelectedDeployment } from "../services";

export function useSelectedDeployment(
  selected: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: applicationKeys.deployment(selected),
    enabled: enabled,
    queryFn: () => getSelectedDeployment(selected),
    retry: false,
  });
}
