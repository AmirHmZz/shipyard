import { toast } from "sonner";

import type { ApplicationActionConfirmationOptions } from "../generics";

import { useDeleteActionResource } from "./useDeleteActionResource";
import { useRollbackApplication } from "./useRollbackApplication";
import { useRunApplicationAction } from "./useRunApplicationAction";
export function useApplicationActionConfirmation({
  confirmAction,
  setConfirmAction,
  id,
  setParams,
}: ApplicationActionConfirmationOptions) {
  function handleConfirmOpenChange(v: boolean) {
    return !v && setConfirmAction("");
  }

  const rollback = useRollbackApplication(id);
  const remove = useDeleteActionResource();
  const action = useRunApplicationAction(id);
  const pending = rollback.isPending || remove.isPending || action.isPending;
  function close() {
    setConfirmAction("");
  }
  function confirm() {
    if (pending) return;
    if (confirmAction.startsWith("rollback:")) {
      rollback.mutate(
        { releaseId: confirmAction.split(":")[1] },
        {
          onSuccess: (deployment) => {
            setParams({ deployment: deployment.id, tab: "deployments" });
            close();
          },
        },
      );
    } else if (confirmAction.startsWith("delete:"))
      remove.mutate(confirmAction, { onSuccess: close });
    else
      action.mutate(confirmAction, {
        onSuccess: () => {
          toast.success(`Application ${confirmAction} requested`);
          close();
        },
      });
  }

  let title = confirmAction + " application?";
  let description = "This operation affects the application containers.";
  if (confirmAction.startsWith("rollback:")) {
    title = "Roll back this application?";
    description =
      "The selected release’s images and configuration will be restored. Application data will not be changed.";
  }
  if (confirmAction.startsWith("delete:")) {
    title = "Remove this route?";
    description =
      "Shipyard will remove its own DNS records when no other routes use them.";
  }
  const destructive =
    confirmAction === "stop" || confirmAction.startsWith("delete:");
  return {
    state: {},
    derived: { pending, title, description, destructive },
    handlers: { handleConfirmOpenChange, confirm },
  };
}
