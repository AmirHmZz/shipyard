import type { Resource } from "@/lib/api/types";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { useAssignTeamMember } from "../hooks";

import { ProjectAccessRow } from "./ProjectAccessRow";
export type ProjectAccessDialogProps = {
  assign: string;
  setAssign: (value: string) => void;
  resources: Resource[];
  team: Resource;
  assignmentMutation: ReturnType<typeof useAssignTeamMember>;
  assignProject: (projectId: string, role: string) => void;
};
export function ProjectAccessDialog({
  assign,
  setAssign,
  resources,
  team,
  assignmentMutation,
  assignProject,
}: ProjectAccessDialogProps) {
  const projects = resources.filter(
    (resource) => resource.kind === "project" && resource.teamId === team.id,
  );
  function handleOpenChange(open: boolean) {
    if (!open) setAssign("");
  }
  return (
    <Dialog open={!!assign} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project access</DialogTitle>
          <DialogDescription>
            Owners and operators can configure and deploy applications. Viewers
            have read access.
          </DialogDescription>
        </DialogHeader>
        {projects.map((project) => (
          <ProjectAccessRow
            key={project.id}
            project={project}
            assignmentMutation={assignmentMutation}
            assignProject={assignProject}
          />
        ))}
      </DialogContent>
    </Dialog>
  );
}
