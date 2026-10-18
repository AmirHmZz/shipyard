import { apiPath } from "@/lib/paths";
import { api } from "@/lib/api/client";
import type { Resource } from "@/lib/api/types";
import type { Settings } from "../generics";

export async function getHAProxySettings(server: Resource) {
  return api<Settings>(apiPath`/servers/${server.id}/haproxy`);
}
