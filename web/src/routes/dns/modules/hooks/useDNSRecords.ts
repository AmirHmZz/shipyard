import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { dnsKeys } from "../generics";
import { getDNSRecords } from "../services";

export function useDNSRecords(zone: Resource) {
  return useQuery({
    queryKey: dnsKeys.records(zone.id),
    queryFn: () => getDNSRecords(zone),
  });
}
