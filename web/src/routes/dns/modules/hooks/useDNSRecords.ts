import type { Resource } from "@/lib/api/types";

import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import { dnsKeys, getDNSRecordsResponseSchema } from "../generics";

export function useDNSRecords(zone: Resource) {
  return useApiQuery({
    queryKey: dnsKeys.records(zone.id),
    path: apiPath`/zones/${zone.id}/records`,
    schema: getDNSRecordsResponseSchema,
  });
}
