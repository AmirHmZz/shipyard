import type { FormEvent } from "react";

import { useReducer } from "react";

import { toastValidationError } from "@/lib/api/toaster";
import { useResources } from "@/lib/hooks/useResources";
import { useAccount } from "@/lib/session";

import {
  initialTeamsState,
  teamsReducer,
  invitationFormSchema,
} from "../generics";
import { useAssignTeamMember } from "./useAssignTeamMember";
import { useCreateInvitation } from "./useCreateInvitation";
import { useRemoveTeamMember } from "./useRemoveTeamMember";
import { useTeamMembers } from "./useTeamMembers";

export function useTeamsPage() {
  const account = useAccount();
  const q = useResources();
  const [state, dispatch] = useReducer(teamsReducer, initialTeamsState);
  const resources = q.data ?? [];
  const teams = resources.filter((resource) => resource.kind === "team");
  const team = teams.find(
    (resource) => resource.id === (state.teamId || teams[0]?.id),
  );
  const members = useTeamMembers(team);
  const removeMutation = useRemoveTeamMember(team?.id);
  const invitationMutation = useCreateInvitation(team?.id ?? "");
  const assignmentMutation = useAssignTeamMember();
  const invitation = invitationMutation.data?.url ?? "";
  function setTeamId(teamId: string) {
    dispatch({ type: "team_changed", teamId });
  }
  function setEditor(open: boolean) {
    dispatch({ type: "editor_changed", open });
  }
  function setEmail(email: string) {
    dispatch({ type: "email_changed", email });
  }
  function setScope(value: string) {
    dispatch({ type: "scope_changed", value });
  }
  function setRole(role: string) {
    dispatch({ type: "role_changed", role });
  }
  function setAssign(userId: string) {
    dispatch({ type: "assignment_changed", userId });
  }
  function setRemove(userId: string) {
    dispatch({ type: "removal_changed", userId });
  }
  function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invitationMutation.isPending) return;
    const parsed = invitationFormSchema.safeParse({
      email: state.email,
      role: state.role,
      projectId: state.project,
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    invitationMutation.mutate(parsed.data);
  }
  function confirmRemoval() {
    if (removeMutation.isPending) return;
    removeMutation.mutate(state.remove, { onSuccess: () => setRemove("") });
  }
  return {
    state,
    derived: {
      account,
      q,
      resources,
      teams,
      team,
      members,
      removeMutation,
      invitationMutation,
      assignmentMutation,
      invitation,
    },
    handlers: {
      setTeamId,
      setEditor,
      setEmail,
      setScope,
      setRole,
      setAssign,
      setRemove,
      submitInvitation,
      confirmRemoval,
    },
  };
}
