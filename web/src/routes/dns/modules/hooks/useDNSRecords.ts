import { dnsKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getDNSRecords } from "../services";
import type { Resource } from "@/lib/api";

export function useDNSRecords(zone: Resource) {
  return useQuery({
    queryKey: dnsKeys.records(zone.id),
    queryFn: () => getDNSRecords(zone),
  });
}
