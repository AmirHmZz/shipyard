import type { MouseEvent } from "react";

import { useState } from "react";

import type { User } from "../generics";

import { useUpdateUser } from "./useUpdateUser";
import { useUsers } from "./useUsers";

export function useUsersPage() {
  const q = useUsers();
  const update = useUpdateUser();
  const [change, setChange] = useState<User | null>(null);
  let access = "a regular user";
  if (change?.admin) access = "a platform administrator";
  if (change?.disabled) access = "disabled";
  const description = `${change?.name} will be ${access}. Existing sessions will end.`;
  function handleOpenChange(open: boolean) {
    if (!open) setChange(null);
  }
  function confirmChange() {
    if (!change) return;
    update.mutate(
      {
        id: change.id,
        access: { admin: change.admin, disabled: change.disabled },
      },
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
      setChange({ ...user, admin: !user.admin });
    if (button.dataset.userAction === "disabled")
      setChange({ ...user, disabled: !user.disabled });
  }
  return {
    state: { change },
    derived: { q, update, description },
    handlers: { handleOpenChange, confirmChange, handleUserAction },
  };
}
