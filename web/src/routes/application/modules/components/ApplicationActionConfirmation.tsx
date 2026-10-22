import { Confirm } from "@/components/Shared";

import type { ApplicationActionConfirmationOptions } from "../generics";

import { useApplicationActionConfirmation } from "../hooks";
export type ApplicationActionConfirmationProps =
  ApplicationActionConfirmationOptions;
export function ApplicationActionConfirmation(
  props: ApplicationActionConfirmationProps,
) {
  const { confirmAction } = props;
  const { derived, handlers } = useApplicationActionConfirmation(props);
  const { pending, title, description, destructive } = derived;
  const { handleConfirmOpenChange, confirm } = handlers;
  return (
    <Confirm
      open={!!confirmAction}
      onOpenChange={handleConfirmOpenChange}
      title={title}
      description={description}
      destructive={destructive}
      pending={pending}
      onConfirm={confirm}
    />
  );
}
