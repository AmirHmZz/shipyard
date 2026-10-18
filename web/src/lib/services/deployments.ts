import { api } from "@/lib/api/client";
import type { Deployment } from "@/lib/api/types";
export function getDeployments(applicationId?: string) {
  return api<Deployment[]>(
    `/deployments${applicationId ? `?applicationId=${encodeURIComponent(applicationId)}` : ""}`,
  );
}
