import type { FormEvent } from "react";

import { Plus, Users } from "lucide-react";
import { useState } from "react";

import { ResourceEditor } from "@/components/resource-editor";
import {
  Confirm,
  CopyButton,
  Empty,
  ErrorState,
  Loading,
  PageHeader,
  StateBadge,
} from "@/components/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useResources } from "@/lib/api";
import { toastValidationError } from "@/lib/api/toaster";
import { PROJECT_ROLES } from "@/lib/enums";
import { useAccount } from "@/lib/session";

import { invitationFormSchema } from "../generics";
import {
  useAssignTeamMember,
  useCreateInvitation,
  useRemoveTeamMember,
  useTeamMembers,
} from "../hooks";
import { ProjectAccessDialog } from "./ProjectAccessDialog";

export function TeamsMainView() {
  const account = useAccount();
  const q = useResources();
  const [teamId, setTeamId] = useState("");
  const [editor, setEditor] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [project, setProject] = useState("");
  const [invitation, setInvitation] = useState("");
  const resources = q.data || [];
  const teams = resources.filter((r) => r.kind === "team");
  const team = teams.find((r) => r.id === (teamId || teams[0]?.id));
  const members = useTeamMembers(team);
  const removeMutation = useRemoveTeamMember(team?.id);
  const invitationMutation = useCreateInvitation(team?.id ?? "");
  const assignmentMutation = useAssignTeamMember();
  const [assign, setAssign] = useState("");
  const [remove, setRemove] = useState("");
  function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invitationMutation.isPending) return;
    const parsed = invitationFormSchema.safeParse({
      email,
      role,
      projectId: project,
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    invitationMutation.mutate(parsed.data, {
      onSuccess: (value) => setInvitation(value.url),
    });
  }
  function confirmRemoval() {
    removeMutation.mutate(remove, { onSuccess: () => setRemove("") });
  }
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Teams & access"
        description="Give trusted people the access they need, with project-level roles."
      >
        <Button disabled={!account?.admin} onClick={() => setEditor(true)}>
          <Plus />
          New team
        </Button>
      </PageHeader>
      {team ? (
        <>
          <Select value={team.id} onValueChange={setTeamId}>
            <SelectTrigger className="mb-6 w-64 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card className="gap-4 overflow-hidden pb-0 shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Members</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {members.error ? (
                  <ErrorState error={members.error} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.data?.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="font-medium">{member.name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {member.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StateBadge state={member.role} />
                          </TableCell>
                          <TableCell>
                            <Button
                              disabled={!team.canWrite}
                              variant="ghost"
                              size="sm"
                              onClick={() => setAssign(member.id)}
                            >
                              Project access
                            </Button>
                            <Button
                              disabled={
                                !team.canWrite || member.id === account?.id
                              }
                              variant="ghost"
                              size="sm"
                              onClick={() => setRemove(member.id)}
                            >
                              Remove member
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
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
                    <Select
                      value={project || "team"}
                      onValueChange={(v) => {
                        setProject(v === "team" ? "" : v);
                        setRole(v === "team" ? "member" : "viewer");
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="team">Team membership</SelectItem>
                        {resources
                          .filter(
                            (r) => r.kind === "project" && r.teamId === team.id,
                          )
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(project ? PROJECT_ROLES : ["member", "owner"]).map(
                          (v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    disabled={!team.canWrite || invitationMutation.isPending}
                    type="submit"
                  >
                    <Plus />
                    Create invitation
                  </Button>
                  {invitation && (
                    <div className="space-y-3 rounded-lg border bg-muted/50 p-3">
                      <p className="break-all font-mono text-[10px]">
                        {invitation}
                      </p>
                      <CopyButton
                        value={invitation}
                        label="Copy invitation link"
                      />
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          </div>
          <ProjectAccessDialog
            assign={assign}
            setAssign={setAssign}
            resources={resources}
            team={team}
            assignmentMutation={assignmentMutation}
          />
        </>
      ) : (
        <Empty
          title="Build a team around your project"
          description="Team owners manage members and access to shared infrastructure."
          icon={<Users />}
          action={
            <Button disabled={!account?.admin} onClick={() => setEditor(true)}>
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
        onOpenChange={(v) => !v && setRemove("")}
        title="Remove team member?"
        description="Their membership and all project grants in this team will be removed."
        destructive
        pending={removeMutation.isPending}
        onConfirm={confirmRemoval}
      />
    </>
  );
}
