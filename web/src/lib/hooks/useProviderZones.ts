import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";
import { providerZoneKeys } from "@/lib/query-keys";
import { getProviderZonesResponseSchema } from "@/lib/schemas/endpoint-responses";
export function useProviderZones(parent: string, open: boolean) {
  return useApiQuery({
    queryKey: providerZoneKeys.parent(parent),
    path: apiPath`/dns/${parent}/zones`,
    schema: getProviderZonesResponseSchema,
    enabled: open && !!parent,
    retry: false,
  });
}
