import type { dnsRecordFormSchema } from "@/lib/validation";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function saveDNSRecord(
  zoneId: string,
  edit: { id?: string },
  payload: typeof dnsRecordFormSchema._output,
) {
  return api<unknown>(
    edit.id
      ? apiPath`/zones/${zoneId}/records/${edit.id}`
      : apiPath`/zones/${zoneId}/records`,
    { method: edit.id ? "PUT" : "POST", body: JSON.stringify(payload) },
  );
}
