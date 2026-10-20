import type { CertificateSummary } from "@/lib/api/types";
import type { Resource } from "@/lib/api/types";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export async function getZoneCertificates(zone: Resource) {
  return api<CertificateSummary[]>(apiPath`/zones/${zone.id}/certificates`);
}
