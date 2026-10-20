import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { DockerVersionResult } from "../generics";

export function checkDockerVersion(serverId: string) {
  return post<DockerVersionResult>(apiPath`/servers/${serverId}/test`);
}
