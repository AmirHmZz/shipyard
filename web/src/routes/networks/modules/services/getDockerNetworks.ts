import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { DockerNetwork } from "../generics";

export async function getDockerNetworks(filter: string) {
  return api<DockerNetwork[]>(apiPath`/servers/${filter}/networks`);
}
