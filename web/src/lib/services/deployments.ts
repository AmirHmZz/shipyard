import type { Deployment } from "@/lib/api/types";

import { api } from "@/lib/api/client";
export function getDeployments(applicationId?: string) {
  return api<Deployment[]>(
    `/deployments${applicationId ? `?applicationId=${encodeURIComponent(applicationId)}` : ""}`,
  );
}
