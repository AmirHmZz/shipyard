import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function removeDNSRecord(zoneId: string, recordId: string) {
  return api<unknown>(apiPath`/zones/${zoneId}/records/${recordId}`, {
    method: "DELETE",
    body: "{}",
  });
}
