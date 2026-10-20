import type { Resource } from "@/lib/api/types";

import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { TeamMembersResponse } from "../generics";

// TODO(openapi): add members response to api/openapi.yaml.
export async function getTeamMembers(team: Resource | undefined) {
  return api<TeamMembersResponse>(apiPath`/teams/${team?.id}/members`);
}
