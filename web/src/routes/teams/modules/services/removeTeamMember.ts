import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function removeTeamMember(teamId: string | undefined, userId: string) {
  return api<unknown>(apiPath`/teams/${teamId}/members/${userId}`, {
    method: "DELETE",
    body: "{}",
  });
}
