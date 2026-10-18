import { configurationKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getHAProxySettings } from "../services";
import type { Resource } from "@/lib/api";

export function useHAProxySettings(server: Resource) {
  return useQuery({
    queryKey: configurationKeys.haproxy(server.id),
    queryFn: () => getHAProxySettings(server),
    refetchInterval: 2000,
  });
}
