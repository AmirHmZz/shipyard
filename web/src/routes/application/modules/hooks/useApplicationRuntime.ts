import { applicationKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getApplicationRuntime } from "../services";

export function useApplicationRuntime(id: string) {
  return useQuery({
    queryKey: applicationKeys.runtime(id),
    queryFn: () => getApplicationRuntime(id),
    refetchInterval: 5000,
  });
}
