import type * as z from "zod/mini";

import { post } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

import type { invitationFormSchema } from "../generics";
import type { InvitationResult } from "../generics";

export function createInvitation(
  teamId: string,
  payload: z.output<typeof invitationFormSchema>,
) {
  return post<InvitationResult>(apiPath`/teams/${teamId}/invitations`, payload);
}
