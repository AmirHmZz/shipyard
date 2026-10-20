import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { dnsRecordResponseSchema } from "@/lib/schemas/dns";

import type { DNSRecordFormValues } from "../generics";

import { dnsKeys } from "../generics";

export function useSaveDNSRecord(zoneId: string, recordId?: string) {
  return useApiMutation({
    method: recordId ? "PUT" : "POST",
    path: recordId
      ? apiPath`/zones/${zoneId}/records/${recordId}`
      : apiPath`/zones/${zoneId}/records`,
    body: (record: DNSRecordFormValues) => record,
    schema: dnsRecordResponseSchema,
    invalidate: [dnsKeys.records(zoneId)],
    meta: { successMessage: "DNS record saved" },
  });
}
