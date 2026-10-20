import type { Resource } from "@/lib/api";

import { useApiQuery } from "@/lib/api/use-api-query";
import { POLL_INTERVALS } from "@/lib/constants";
import { apiPath } from "@/lib/paths";

import { dnsKeys, getZoneCertificatesResponseSchema } from "../generics";

export function useZoneCertificates(zone: Resource) {
  return useApiQuery({
    queryKey: dnsKeys.certificates(zone.id),
    path: apiPath`/zones/${zone.id}/certificates`,
    schema: getZoneCertificatesResponseSchema,
    refetchInterval: POLL_INTERVALS.metrics,
  });
}
