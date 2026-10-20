import { useQuery } from "@tanstack/react-query";

import { settingsKeys } from "../generics";
import { getSystemUpdates } from "../services";

export function useSystemUpdates() {
  return useQuery({
    queryKey: settingsKeys.systemUpdates,
    queryFn: () => getSystemUpdates(),
    refetchInterval: 3000,
  });
}
