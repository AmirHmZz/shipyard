import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function retryServerDeletion(id: string) {
  return post<unknown>(apiPath`/servers/${id}/deletion/retry`);
}
