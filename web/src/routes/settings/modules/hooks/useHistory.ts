import { settingsKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getHistory } from "../services";

export function useHistory(type: "audit" | "jobs") {
  return useQuery({
    queryKey: settingsKeys.history(type),
    queryFn: () => getHistory(type),
    refetchInterval: 10000,
  });
}
