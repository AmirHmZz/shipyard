import { useMutation, useQueryClient } from "@tanstack/react-query";

import { teamKeys } from "../generics";
import { removeTeamMember } from "../services";

export function useRemoveTeamMember(teamId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => removeTeamMember(teamId, memberId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: teamKeys.members(teamId) }),
  });
}
