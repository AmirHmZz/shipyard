import { Plus } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { SelectControl } from "@/components/SelectControl";
import { CopyButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

import type { useTeamsPage } from "../hooks";
export type TeamInvitationFormProps = {
  controller: ReturnType<typeof useTeamsPage>;
  team: Resource;
};
export function TeamInvitationForm({
  controller,
  team,
}: TeamInvitationFormProps) {
  const { email, role, project } = controller.state;
  const { invitationMutation, invitation, scopeOptions, roles } =
    controller.derived;
  const { setEmail, setScope, setRole, submitInvitation } = controller.handlers;
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-sm">Invite a teammate</CardTitle>
        <CardDescription>
          Create a single-use link, valid for 48 hours.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submitInvitation}>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Access scope</Label>
            <SelectControl
              value={project || "team"}
              onValueChange={setScope}
              options={scopeOptions}
              triggerProps={{ className: "w-full" }}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <SelectControl
              value={role}
              onValueChange={setRole}
              options={roles}
              triggerProps={{ className: "w-full" }}
            />
          </div>
          <Button
            disabled={!team.canWrite || invitationMutation.isPending}
            type="submit"
          >
            {invitationMutation.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <Plus />
            )}
            Create invitation
          </Button>
          {invitationMutation.isPending && (
            <p role="status" className="text-xs text-muted-foreground">
              Creating invitation for {invitationMutation.variables?.email}…
            </p>
          )}
          {invitation && (
            <div className="space-y-3 rounded-lg border bg-muted/50 p-3">
              <p className="break-all font-mono text-[10px]">{invitation}</p>
              <CopyButton value={invitation} label="Copy invitation link" />
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
