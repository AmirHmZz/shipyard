import type * as React from "react";

import { Plus } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { FormField } from "@/components/FormField";
import { InputField } from "@/components/InputField";
import { SelectControl } from "@/components/SelectControl";
import { CopyButton } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return setEmail(e.target.value);
  }

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
        <form className="flex flex-col gap-4" onSubmit={submitInvitation}>
          <InputField
            label={<>Email</>}
            labelProps={{}}
            inputProps={{
              type: "email",
              value: email,
              onChange: handleInputChange,
              required: true,
            }}
          />
          <FormField label={<>Access scope</>} labelProps={{}}>
            <SelectControl
              value={project || "team"}
              onValueChange={setScope}
              options={scopeOptions}
              triggerProps={{ className: "w-full" }}
            />
          </FormField>
          <FormField label={<>Role</>} labelProps={{}}>
            <SelectControl
              value={role}
              onValueChange={setRole}
              options={roles}
              triggerProps={{ className: "w-full" }}
            />
          </FormField>
          <Button
            className="self-start"
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
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-3">
              <p className="break-all font-mono text-[10px]">{invitation}</p>
              <CopyButton
                className="self-start"
                value={invitation}
                label="Copy invitation link"
              />
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
