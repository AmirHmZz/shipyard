import { apiPath } from "@/lib/paths";
import { api } from "@/lib/api/client";
import type { Metric } from "@/lib/api/types";
import type { Resource } from "@/lib/api/types";

export async function getServerMetrics(server: Resource) {
  return api<Metric[]>(apiPath`/servers/${server.id}/metrics`);
}
