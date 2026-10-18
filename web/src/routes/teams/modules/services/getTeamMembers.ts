import { apiPath } from "@/lib/paths";
import type { TeamMembersResponse } from "../generics";
import { api } from "@/lib/api/client";
import type { Resource } from "@/lib/api/types";

// TODO(openapi): add members response to api/openapi.yaml.
export async function getTeamMembers(team: Resource | undefined) {
  return api<TeamMembersResponse>(apiPath`/teams/${team?.id}/members`);
}
