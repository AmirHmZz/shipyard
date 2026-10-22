import { StateBadge } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";

import type { User } from "../generics";
export type UserSettingsRowProps = { user: User; currentUserId: string };
export function UserSettingsRow({
  user: u,
  currentUserId,
}: UserSettingsRowProps) {
  let access = "member";
  if (u.admin) access = "administrator";
  if (u.disabled) access = "disabled";
  return (
    <TableRow>
      <TableCell>
        <div>{u.name}</div>
        <div className="text-xs text-muted-foreground">{u.email}</div>
      </TableCell>
      <TableCell>
        <StateBadge state={access} />
      </TableCell>
      <TableCell>{u.totp ? "Enabled" : "Off"}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={u.id === currentUserId}
            data-user-id={u.id}
            data-user-action="admin"
          >
            {u.admin ? "Remove admin" : "Make admin"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={u.id === currentUserId}
            data-user-id={u.id}
            data-user-action="disabled"
          >
            {u.disabled ? "Enable" : "Disable"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
