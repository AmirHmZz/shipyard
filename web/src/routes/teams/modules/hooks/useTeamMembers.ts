import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { teamKeys } from "../generics";
import { getTeamMembers } from "../services";

export function useTeamMembers(team: Resource | undefined) {
  return useQuery({
    queryKey: teamKeys.members(team?.id),
    queryFn: () => getTeamMembers(team),
    enabled: !!team,
  });
}
