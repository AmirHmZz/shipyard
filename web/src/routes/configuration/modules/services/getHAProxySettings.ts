import type { Resource } from "@/lib/api/types";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { Settings } from "../generics";

export async function getHAProxySettings(server: Resource) {
  return api<Settings>(apiPath`/servers/${server.id}/haproxy`);
}
