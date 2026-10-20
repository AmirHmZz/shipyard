import { useState } from "react";

import type { Session } from "@/lib/api/types";

import { Confirm, ErrorState, Loading, StateBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { User } from "../generics";

import { useUpdateUser, useUsers } from "../hooks";

export function UserSettings({ session }: { session: Session }) {
  const q = useUsers();
  const update = useUpdateUser();
  const [change, setChange] = useState<User | null>(null);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <Card className="overflow-hidden pb-0 shadow-none">
        <CardHeader>
          <CardTitle>Platform users</CardTitle>
          <CardDescription>
            Invite new users from Teams & access. Changing access ends the
            user's sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Authenticator</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div>{u.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StateBadge
                      state={
                        u.disabled
                          ? "disabled"
                          : u.admin
                            ? "administrator"
                            : "member"
                      }
                    />
                  </TableCell>
                  <TableCell>{u.totp ? "Enabled" : "Off"}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={u.id === session.user.id}
                      onClick={() => setChange({ ...u, admin: !u.admin })}
                    >
                      {u.admin ? "Remove admin" : "Make admin"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={u.id === session.user.id}
                      onClick={() => setChange({ ...u, disabled: !u.disabled })}
                    >
                      {u.disabled ? "Enable" : "Disable"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Confirm
        open={!!change}
        onOpenChange={(v) => !v && setChange(null)}
        title="Change user access?"
        description={`${change?.name} will be ${change?.disabled ? "disabled" : change?.admin ? "a platform administrator" : "a regular user"}. Existing sessions will end.`}
        pending={update.isPending}
        onConfirm={() => {
          if (!change) return;
          update.mutate(
            {
              id: change?.id,
              access: { admin: change?.admin, disabled: change?.disabled },
            },
            { onSuccess: () => setChange(null) },
          );
        }}
      />
    </>
  );
}
