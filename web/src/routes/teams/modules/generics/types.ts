import type * as z from "zod/mini";

import type { teamKeys } from "./constants";
import type {
  teamMembersResponseSchema,
  invitationFormSchema,
  projectAssignmentSchema,
} from "./schema";
// TODO(openapi): add TeamMembersResponse to api/openapi.yaml.
export type TeamMembersResponse = z.infer<typeof teamMembersResponseSchema>;

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
