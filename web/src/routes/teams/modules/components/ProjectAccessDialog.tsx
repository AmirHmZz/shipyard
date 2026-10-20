import { toast } from "sonner";

import type { Resource } from "@/lib/api";

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
import { errorMessage } from "@/lib/api";
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
                onValueChange={async (value) => {
                  try {
                    await assignmentMutation.mutateAsync({
                      projectId: p.id,
                      assignment: projectAssignmentSchema.parse({
                        userId: assign,
                        role: value,
                      }),
                    });
                    toast.success("Project access updated");
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
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
