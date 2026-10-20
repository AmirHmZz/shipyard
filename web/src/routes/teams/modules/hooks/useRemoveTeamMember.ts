import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import { teamKeys } from "../generics";

export function useRemoveTeamMember(teamId: string | undefined) {
  return useApiMutation({
    method: "DELETE",
    path: (memberId: string) => apiPath`/teams/${teamId}/members/${memberId}`,
    body: () => ({}),
    schema: okResponseSchema,
    invalidate: [teamKeys.members(teamId)],
    meta: { successMessage: "Member removed" },
  });
}
