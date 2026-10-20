import type { haproxySettingsSchema } from "@/lib/validation";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { HAProxyUpdateResult } from "../generics";

export function saveHAProxySettings(
  serverId: string,
  payload: typeof haproxySettingsSchema._output,
) {
  return api<HAProxyUpdateResult>(apiPath`/servers/${serverId}/haproxy`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
