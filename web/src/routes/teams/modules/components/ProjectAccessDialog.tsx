import type { Resource } from "@/lib/api/types";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastValidationError } from "@/lib/api/toaster";
import { ASSIGNMENT_ROLES } from "@/lib/enums";

import type { useAssignTeamMember } from "../hooks";

import { projectAssignmentSchema } from "../generics";
export function ProjectAccessDialog({
  assign,
  setAssign,
  resources,
  team,
  assignmentMutation,
}: {
  assign: string;
  setAssign: (value: string) => void;
  resources: Resource[];
  team: Resource;
  assignmentMutation: ReturnType<typeof useAssignTeamMember>;
}) {
  function assignProject(projectId: string, role: string) {
    const assignment = projectAssignmentSchema.safeParse({
      userId: assign,
      role,
    });
    if (!assignment.success) {
      toastValidationError(assignment.error);
      return;
    }
    assignmentMutation.mutate({ projectId, assignment: assignment.data });
  }
  return (
    <Dialog open={!!assign} onOpenChange={(v) => !v && setAssign("")}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project access</DialogTitle>
          <DialogDescription>
            Owners and operators can configure and deploy applications. Viewers
            have read access.
          </DialogDescription>
        </DialogHeader>
        {resources
          .filter((r) => r.kind === "project" && r.teamId === team.id)
          .map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <Label>{p.name}</Label>
              <Select
                disabled={
                  assignmentMutation.isPending &&
                  assignmentMutation.variables?.projectId === p.id
                }
                onValueChange={(value) => assignProject(p.id, value)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Assign role" />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_ROLES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
      </DialogContent>
    </Dialog>
  );
}
