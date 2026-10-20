import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { configurationKeys } from "../generics";
import { getHAProxySettings } from "../services";

export function useHAProxySettings(server: Resource) {
  return useQuery({
    queryKey: configurationKeys.haproxy(server.id),
    queryFn: () => getHAProxySettings(server),
    refetchInterval: 2000,
  });
}
