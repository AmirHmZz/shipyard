import type { invitationFormSchema } from "@/lib/validation";

import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { InvitationResult } from "../generics";

export function createInvitation(
  teamId: string,
  payload: typeof invitationFormSchema._output,
) {
  return post<InvitationResult>(apiPath`/teams/${teamId}/invitations`, payload);
}
