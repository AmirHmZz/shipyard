import type { Resource } from "@/lib/api/types";

import { ErrorState } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { useTeamsPage } from "../hooks";

import { TeamMemberRow } from "./TeamMemberRow";
export type TeamMembersProps = {
  controller: ReturnType<typeof useTeamsPage>;
  team: Resource;
};
export function TeamMembers({ controller, team }: TeamMembersProps) {
  const { account, members } = controller.derived;
  const { handleMemberAction } = controller.handlers;
  return (
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
            <TableBody onClick={handleMemberAction}>
              {members.data?.map((member) => (
                <TeamMemberRow
                  key={member.id}
                  member={member}
                  canWrite={team.canWrite}
                  currentUserId={account?.id}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
