import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function repairServerConnection(
  serverId: string,
  payload: {
    host: string;
    port: number;
    user: string;
    fingerprint: string;
    authMethod: string;
    secrets: Record<string, string>;
  },
) {
  return api<unknown>(apiPath`/servers/${serverId}/deletion/connection`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
