import type * as z from "zod/mini";

import type {
  teamMembersResponseSchema,
  invitationResultResponseSchema,
} from "./schema";
// TODO(openapi): add TeamMembersResponse to api/openapi.yaml.
export type TeamMembersResponse = z.infer<typeof teamMembersResponseSchema>;

// TODO(openapi): add InvitationResult to api/openapi.yaml.
export type InvitationResult = z.infer<typeof invitationResultResponseSchema>;
