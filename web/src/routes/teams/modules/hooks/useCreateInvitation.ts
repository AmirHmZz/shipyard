import { useMutation } from "@tanstack/react-query";
import { createInvitation } from "../services";

type Invitation = Parameters<typeof createInvitation>[1];

export function useCreateInvitation(teamId: string) {
  return useMutation({
    mutationFn: (invitation: Invitation) =>
      createInvitation(teamId, invitation),
  });
}
