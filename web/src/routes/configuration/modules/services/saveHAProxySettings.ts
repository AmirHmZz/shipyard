import { api } from "@/lib/api/client";
import type { HAProxyUpdateResult } from "../generics";
import type { haproxySettingsSchema } from "@/lib/validation";
import { apiPath } from "@/lib/paths";

export function saveHAProxySettings(
  serverId: string,
  payload: typeof haproxySettingsSchema._output,
) {
  return api<HAProxyUpdateResult>(apiPath`/servers/${serverId}/haproxy`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
