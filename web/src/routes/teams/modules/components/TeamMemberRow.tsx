import { StateBadge } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";

import type { TeamMembersResponse } from "../generics";
export type TeamMemberRowProps = {
  member: TeamMembersResponse[number];
  canWrite: boolean;
  currentUserId: string | undefined;
};
export function TeamMemberRow({
  member,
  canWrite,
  currentUserId,
}: TeamMemberRowProps) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{member.name}</div>
        <div className="mt-1 text-xs text-muted-foreground">{member.email}</div>
      </TableCell>
      <TableCell>
        <StateBadge state={member.role} />
      </TableCell>
      <TableCell>
        <Button
          disabled={!canWrite}
          variant="ghost"
          size="sm"
          data-member-id={member.id}
          data-action="assign"
        >
          Project access
        </Button>
        <Button
          disabled={!canWrite || member.id === currentUserId}
          variant="ghost"
          size="sm"
          data-member-id={member.id}
          data-action="remove"
        >
          Remove member
        </Button>
      </TableCell>
    </TableRow>
  );
}
