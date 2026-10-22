import type { Resource } from "@/lib/api/types";

import { useApiQuery } from "@/lib/api/use-api-query";
import { apiPath } from "@/lib/paths";

import { teamKeys, teamMembersResponseSchema } from "../generics";

export function useTeamMembers(team: Resource | undefined) {
  return useApiQuery({
    queryKey: teamKeys.members(team?.id),
    path: apiPath`/teams/${team?.id}/members`,
    schema: teamMembersResponseSchema,
    enabled: !!team,
  });
}
