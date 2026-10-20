import type { Metric } from "@/lib/api/types";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export async function getApplicationMetrics(id: string) {
  return api<Metric[]>(apiPath`/applications/${id}/metrics`);
}
