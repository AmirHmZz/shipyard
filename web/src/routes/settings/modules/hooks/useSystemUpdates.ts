import { settingsKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getSystemUpdates } from "../services";

export function useSystemUpdates() {
  return useQuery({
    queryKey: settingsKeys.systemUpdates,
    queryFn: () => getSystemUpdates(),
    refetchInterval: 3000,
  });
}
