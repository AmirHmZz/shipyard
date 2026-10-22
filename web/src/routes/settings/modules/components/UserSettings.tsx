import type { Session } from "@/lib/api/types";

import { Confirm, ErrorState, Loading } from "@/components/Shared";
import { TableHeadings } from "@/components/TableHeadings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableHeader } from "@/components/ui/table";

import { useUsersPage } from "../hooks";
import { UserSettingsRow } from "./UserSettingsRow";
export type UserSettingsProps = { session: Session };
export function UserSettings({ session }: UserSettingsProps) {
  const { state, derived, handlers } = useUsersPage();
  const { change } = state;
  const { q, update, description } = derived;
  const { handleOpenChange, confirmChange, handleUserAction } = handlers;
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
              <TableHeadings
                columns={[
                  { id: "name", label: <>Name</> },
                  { id: "access", label: <>Access</> },
                  { id: "authenticator", label: <>Authenticator</> },
                  { id: "actions", label: <></> },
                ]}
                rowProps={{}}
              />
            </TableHeader>
            <TableBody onClick={handleUserAction}>
              {q.data?.map((u) => (
                <UserSettingsRow
                  key={u.id}
                  user={u}
                  currentUserId={session.user.id}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Confirm
        open={!!change}
        onOpenChange={handleOpenChange}
        title="Change user access?"
        description={description}
        pending={update.isPending}
        onConfirm={confirmChange}
      />
    </>
  );
}
