import { teamKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getTeamMembers } from "../services";
import type { Resource } from "@/lib/api";

export function useTeamMembers(team: Resource | undefined) {
  return useQuery({
    queryKey: teamKeys.members(team?.id),
    queryFn: () => getTeamMembers(team),
    enabled: !!team,
  });
}
