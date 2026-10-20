import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import type { AssignTeamMemberVariables } from "../generics";

export function useAssignTeamMember() {
  return useApiMutation({
    method: "POST",
    path: ({ projectId }: AssignTeamMemberVariables) =>
      apiPath`/projects/${projectId}/members`,
    body: ({ assignment }) => assignment,
    schema: okResponseSchema,
    meta: { successMessage: "Project access updated" },
  });
}
