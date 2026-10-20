import type { Resource } from "@/lib/api/types";

import { SelectControl } from "@/components/SelectControl";
import { Label } from "@/components/ui/label";
import { ASSIGNMENT_ROLES } from "@/lib/enums";

import type { useAssignTeamMember } from "../hooks";

export type ProjectAccessRowProps = {
  project: Resource;
  assignmentMutation: ReturnType<typeof useAssignTeamMember>;
  assignProject: (projectId: string, role: string) => void;
};
export function ProjectAccessRow({
  project,
  assignmentMutation,
  assignProject,
}: ProjectAccessRowProps) {
  const pending =
    assignmentMutation.isPending &&
    assignmentMutation.variables?.projectId === project.id;
  function handleRoleChange(role: string) {
    assignProject(project.id, role);
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <Label>{project.name}</Label>
      <SelectControl
        disabled={pending}
        onValueChange={handleRoleChange}
        options={ASSIGNMENT_ROLES}
        placeholder="Assign role"
        triggerProps={{ className: "w-36" }}
      />
    </div>
  );
}
