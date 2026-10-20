import type * as z from "zod/mini";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { dnsRecordFormSchema } from "../generics";

export function saveDNSRecord(
  zoneId: string,
  edit: { id?: string },
  payload: z.output<typeof dnsRecordFormSchema>,
) {
  return api<unknown>(
    edit.id
      ? apiPath`/zones/${zoneId}/records/${edit.id}`
      : apiPath`/zones/${zoneId}/records`,
    { method: edit.id ? "PUT" : "POST", body: JSON.stringify(payload) },
  );
}
