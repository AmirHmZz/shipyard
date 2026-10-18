import { post } from "@/lib/api/client";
import type { InvitationResult } from "../generics";
import type { invitationFormSchema } from "@/lib/validation";
import { apiPath } from "@/lib/paths";

export function createInvitation(
  teamId: string,
  payload: typeof invitationFormSchema._output,
) {
  return post<InvitationResult>(apiPath`/teams/${teamId}/invitations`, payload);
}
