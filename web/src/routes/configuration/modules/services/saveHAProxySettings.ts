import type * as z from "zod/mini";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { haproxySettingsSchema } from "../generics";
import type { HAProxyUpdateResult } from "../generics";

export function saveHAProxySettings(
  serverId: string,
  payload: z.output<typeof haproxySettingsSchema>,
) {
  return api<HAProxyUpdateResult>(apiPath`/servers/${serverId}/haproxy`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
