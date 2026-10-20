import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { dnsKeys } from "../generics";
import { getZoneCertificates } from "../services";

export function useZoneCertificates(zone: Resource) {
  return useQuery({
    queryKey: dnsKeys.certificates(zone.id),
    queryFn: () => getZoneCertificates(zone),
    refetchInterval: 30000,
  });
}
