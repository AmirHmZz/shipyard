import { sessionKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "../services";

export function useSession() {
  return useQuery({
    queryKey: sessionKeys.all,
    queryFn: () => getSession(),
    retry: false,
    refetchInterval: 60000,
  });
}
