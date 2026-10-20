import type * as z from "zod/mini";

import type { teamKeys } from "./constants";
import type {
  teamMembersResponseSchema,
  invitationResultResponseSchema,
  invitationFormSchema,
  projectAssignmentSchema,
} from "./schema";
// TODO(openapi): add TeamMembersResponse to api/openapi.yaml.
export type TeamMembersResponse = z.infer<typeof teamMembersResponseSchema>;

// TODO(openapi): add InvitationResult to api/openapi.yaml.
export type InvitationResult = z.infer<typeof invitationResultResponseSchema>;
export type Invitation = z.infer<typeof invitationFormSchema>;
export type ProjectAssignment = z.infer<typeof projectAssignmentSchema>;
export type AssignTeamMemberVariables = {
  projectId: string;
  assignment: ProjectAssignment;
};
export type RemovedMemberSnapshot = {
  queryKey: ReturnType<typeof teamKeys.members>;
  members: TeamMembersResponse | undefined;
};
