import type { useSearchParams } from "react-router";

import { toast } from "sonner";

import { Confirm } from "@/components/shared";

import {
  useRollbackApplication,
  useDeleteActionResource,
  useRunApplicationAction,
} from "../hooks";

export function ApplicationActionConfirmation({
  confirmAction,
  setConfirmAction,
  id,
  setParams,
}: {
  confirmAction: string;
  setConfirmAction: (action: string) => void;
  id: string;
  setParams: ReturnType<typeof useSearchParams>[1];
}) {
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
  return (
    <Confirm
      open={!!confirmAction}
      onOpenChange={(v) => !v && setConfirmAction("")}
      title={
        confirmAction.startsWith("rollback:")
          ? "Roll back this application?"
          : confirmAction.startsWith("delete:")
            ? "Remove this route?"
            : `${confirmAction} application?`
      }
      description={
        confirmAction.startsWith("delete:")
          ? "Shipyard will remove its own DNS records when no other routes use them."
          : confirmAction.startsWith("rollback:")
            ? "The selected release’s images and configuration will be restored. Application data will not be changed."
            : "This operation affects the application containers."
      }
      destructive={
        confirmAction === "stop" || confirmAction.startsWith("delete:")
      }
      pending={pending}
      onConfirm={confirm}
    />
  );
}
