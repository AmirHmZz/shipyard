import { apiPath } from "@/lib/paths";
import { api } from "@/lib/api/client";
import type { Metric } from "@/lib/api/types";

export async function getApplicationMetrics(id: string) {
  return api<Metric[]>(apiPath`/applications/${id}/metrics`);
}
