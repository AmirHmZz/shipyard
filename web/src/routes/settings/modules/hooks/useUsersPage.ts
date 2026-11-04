import type { MouseEvent } from "react";

import { useState } from "react";

import type { User } from "../generics";

import { useDeleteUser } from "./useDeleteUser";
import { useUpdateUser } from "./useUpdateUser";
import { useUsers } from "./useUsers";

export function useUsersPage() {
  const q = useUsers();
  const update = useUpdateUser();
  const remove = useDeleteUser();
  const [change, setChange] = useState<{
    kind: "access" | "delete";
    user: User;
  } | null>(null);
  const pending = update.isPending || remove.isPending;
  const deleting = change?.kind === "delete";
  let access = "a regular user";
  if (change?.user.admin) access = "a platform administrator";
  if (change?.user.disabled) access = "disabled";
  const description = deleting
    ? `Permanently delete ${change.user.name} (${change.user.email})? This ends their sessions, removes their team and project memberships, and revokes their outstanding invitations.`
    : `${change?.user.name} will be ${access}. Existing sessions will end.`;
  function handleOpenChange(open: boolean) {
    if (!open && !pending) setChange(null);
  }
  function confirmChange() {
    if (!change || pending) return;
    const { id, admin, disabled } = change.user;
    if (change.kind === "delete") {
      remove.mutate(id, { onSuccess: () => setChange(null) });
      return;
    }
    update.mutate(
      { id, access: { admin, disabled } },
      { onSuccess: () => setChange(null) },
    );
  }
  function handleUserAction(event: MouseEvent<HTMLTableSectionElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-user-id]",
    );
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return;
    const user = q.data?.find((user) => user.id === button.dataset.userId);
    if (!user) return;
    if (button.dataset.userAction === "admin")
      setChange({ kind: "access", user: { ...user, admin: !user.admin } });
    if (button.dataset.userAction === "disabled")
      setChange({
        kind: "access",
        user: { ...user, disabled: !user.disabled },
      });
    if (button.dataset.userAction === "delete")
      setChange({ kind: "delete", user });
  }
  return {
    state: { change },
    derived: { q, pending, deleting, description },
    handlers: { handleOpenChange, confirmChange, handleUserAction },
  };
}
