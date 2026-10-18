import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dnsKeys } from "../generics";
import { removeDNSRecord } from "../services";

export function useRemoveDNSRecord(zoneId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) => removeDNSRecord(zoneId, recordId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: dnsKeys.records(zoneId) }),
  });
}
