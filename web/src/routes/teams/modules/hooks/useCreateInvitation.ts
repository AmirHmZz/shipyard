import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";

import type { Invitation } from "../generics";

import { invitationResultResponseSchema } from "../generics";

export function useCreateInvitation(teamId: string) {
  return useApiMutation({
    method: "POST",
    path: apiPath`/teams/${teamId}/invitations`,
    body: (invitation: Invitation) => invitation,
    schema: invitationResultResponseSchema,
    meta: { successMessage: "Invitation created" },
  });
}
