import { apiPath } from "@/lib/paths";
import { api } from "@/lib/api/client";
import type { DNSRecord } from "@/lib/api/types";
import type { Resource } from "@/lib/api/types";

export async function getDNSRecords(zone: Resource) {
  return api<DNSRecord[]>(apiPath`/zones/${zone.id}/records`);
}
