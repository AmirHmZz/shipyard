import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";
import type { DockerNetworkInventory } from "../generics";

export function getNetworkInventory(server: string) {
  return api<DockerNetworkInventory>(apiPath`/servers/${server}/networks`);
}
