import { dnsKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getZoneCertificates } from "../services";
import type { Resource } from "@/lib/api";

export function useZoneCertificates(zone: Resource) {
  return useQuery({
    queryKey: dnsKeys.certificates(zone.id),
    queryFn: () => getZoneCertificates(zone),
    refetchInterval: 30000,
  });
}
