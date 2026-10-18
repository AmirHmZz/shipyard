import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function provisionServer(serverId: string | undefined) {
  return post<unknown>(apiPath`/servers/${serverId}/provision`);
}
