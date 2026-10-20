import { useMutation } from "@tanstack/react-query";

import { assignTeamMember } from "../services";

type Assignment = Parameters<typeof assignTeamMember>[1];

export function useAssignTeamMember() {
  return useMutation({
    mutationFn: ({
      projectId,
      assignment,
    }: {
      projectId: string;
      assignment: Assignment;
    }) => assignTeamMember(projectId, assignment),
  });
}
