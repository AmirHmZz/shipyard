import { Plus, Users } from "lucide-react";

import { ResourceEditor } from "@/components/resource-editor";
import {
  Confirm,
  Empty,
  ErrorState,
  Loading,
  PageHeader,
} from "@/components/Shared";
import { Button } from "@/components/ui/button";

import { useTeamsPage } from "../hooks";
import { TeamWorkspace } from "./TeamWorkspace";
export function TeamsMainView() {
  function handleButtonClick() {
    return setEditor(true);
  }
  function handleButtonClick2() {
    return setEditor(true);
  }

  const controller = useTeamsPage();
  const { editor, remove } = controller.state;
  const { account, q, resources, team, removeMutation } = controller.derived;
  const { setEditor, confirmRemoval, handleRemovalOpenChange } =
    controller.handlers;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Teams & access"
        description="Give trusted people the access they need, with project-level roles."
      >
        <Button disabled={!account?.admin} onClick={handleButtonClick}>
          <Plus />
          New team
        </Button>
      </PageHeader>
      {team ? (
        <TeamWorkspace controller={controller} team={team} />
      ) : (
        <Empty
          title="Build a team around your project"
          description="Team owners manage members and access to shared infrastructure."
          icon={<Users />}
          action={
            <Button disabled={!account?.admin} onClick={handleButtonClick2}>
              <Plus />
              Create team
            </Button>
          }
        />
      )}
      <ResourceEditor
        open={editor}
        onOpenChange={setEditor}
        kind="team"
        resources={resources}
      />
      <Confirm
        open={!!remove}
        onOpenChange={handleRemovalOpenChange}
        title="Remove team member?"
        description="Their membership and all project grants in this team will be removed."
        destructive
        pending={removeMutation.isPending}
        onConfirm={confirmRemoval}
      />
    </>
  );
}
