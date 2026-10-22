import type { MutationFunctionContext } from "@tanstack/react-query";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import type { RemovedMemberSnapshot, TeamMembersResponse } from "../generics";

import { teamKeys } from "../generics";

// Export the cache policy so MutationObserver tests exercise the same lifecycle.
export function memberRemovalPolicy(teamId: string | undefined) {
  const queryKey = teamKeys.members(teamId);
  const mutationKey = teamKeys.memberRemoval;
  return {
    mutationKey,
    onMutate: async (memberId: string, context: MutationFunctionContext) => {
      await context.client.cancelQueries({ queryKey });
      const members =
        context.client.getQueryData<TeamMembersResponse>(queryKey);
      context.client.setQueryData<TeamMembersResponse>(queryKey, (current) =>
        current?.filter((member) => member.id !== memberId),
      );
      return { queryKey, members };
    },
    onError: (
      _error: unknown,
      memberId: string,
      snapshot: RemovedMemberSnapshot | undefined,
      context: MutationFunctionContext,
    ) => {
      const previous = snapshot?.members;
      if (!snapshot || !previous) return;
      const removed = previous.find((member) => member.id === memberId);
      if (!removed) return;
      context.client.setQueryData<TeamMembersResponse>(
        snapshot.queryKey,
        (current) => {
          if (!current) return previous;
          if (current.some((member) => member.id === memberId)) return current;
          const originalIndex = previous.findIndex(
            (member) => member.id === memberId,
          );
          const anchor = previous
            .slice(originalIndex + 1)
            .find((member) => current.some((row) => row.id === member.id));
          const position = current.findIndex(
            (member) => member.id === anchor?.id,
          );
          const restored = [...current];
          restored.splice(
            position < 0 ? restored.length : position,
            0,
            removed,
          );
          return restored;
        },
      );
    },
    onSettled: (
      _data: unknown,
      _error: unknown,
      _memberId: string,
      _snapshot: RemovedMemberSnapshot | undefined,
      context: MutationFunctionContext,
    ) => {
      if (context.client.isMutating({ mutationKey }) === 1)
        return context.client.invalidateQueries({
          queryKey: teamKeys.membersPrefix,
        });
    },
  };
}

export function useRemoveTeamMember(teamId: string | undefined) {
  return useApiMutation({
    ...memberRemovalPolicy(teamId),
    method: "DELETE",
    path: (memberId: string) => apiPath`/teams/${teamId}/members/${memberId}`,
    body: () => ({}),
    schema: okResponseSchema,
    meta: { successMessage: "Member removed" },
  });
}
