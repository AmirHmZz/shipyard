import type { Resource } from "@/lib/api/types";

import { SelectControl } from "@/components/SelectControl";

import type { useTeamsPage } from "../hooks";

import { ProjectAccessDialog } from "./ProjectAccessDialog";
import { TeamInvitationForm } from "./TeamInvitationForm";
import { TeamMembers } from "./TeamMembers";
export type TeamWorkspaceProps = {
  controller: ReturnType<typeof useTeamsPage>;
  team: Resource;
};
export function TeamWorkspace({ controller, team }: TeamWorkspaceProps) {
  const { assign } = controller.state;
  const { resources, teamOptions, assignmentMutation } = controller.derived;
  const { setTeamId, setAssign, assignProject } = controller.handlers;
  return (
    <>
      <SelectControl
        value={team.id}
        onValueChange={setTeamId}
        options={teamOptions}
        triggerProps={{ className: "mb-6 w-64 bg-card" }}
      />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <TeamMembers controller={controller} team={team} />
        <TeamInvitationForm controller={controller} team={team} />
      </div>
      <ProjectAccessDialog
        assign={assign}
        setAssign={setAssign}
        resources={resources}
        team={team}
        assignmentMutation={assignmentMutation}
        assignProject={assignProject}
      />
    </>
  );
}
