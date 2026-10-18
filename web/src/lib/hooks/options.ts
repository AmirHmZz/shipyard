import { applicationServiceKeys } from "@/lib/query-keys";
import { providerZoneKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { getProviderZones, getServiceOptions } from "@/lib/services";

export function useProviderZones(parent: string, open: boolean) {
  return useQuery({
    queryKey: providerZoneKeys.parent(parent),
    queryFn: () => getProviderZones(parent),
    enabled: open && !!parent,
    retry: false,
  });
}

export function useServiceOptions(parent: string, open: boolean) {
  return useQuery({
    queryKey: applicationServiceKeys.parent(parent),
    queryFn: () => getServiceOptions(parent),
    enabled: open && !!parent,
    retry: false,
  });
}
