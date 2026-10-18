import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function removeDeployment(deploymentId: string) {
  return api<unknown>(apiPath`/deployments/${deploymentId}`, {
    method: "DELETE",
  });
}
