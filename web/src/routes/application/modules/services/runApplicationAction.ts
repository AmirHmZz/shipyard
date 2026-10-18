import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function runApplicationAction(id: string, payload: { action: string }) {
  return post<unknown>(apiPath`/applications/${id}/action`, payload);
}
