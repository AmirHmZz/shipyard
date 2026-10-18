import { post } from "@/lib/api/client";
import type { DockerVersionResult } from "../generics";
import { apiPath } from "@/lib/paths";

export function checkDockerVersion(serverId: string) {
  return post<DockerVersionResult>(apiPath`/servers/${serverId}/test`);
}
