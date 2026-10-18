import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function assignTeamMember(
  projectId: string,
  payload: { userId: string; role: "owner" | "operator" | "viewer" | "remove" },
) {
  return post<unknown>(apiPath`/projects/${projectId}/members`, payload);
}
