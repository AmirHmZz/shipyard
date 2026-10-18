import { resourceKeys } from "@/lib/query-keys";
import { rollbackApplication, deleteActionResource } from "../services";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Confirm } from "@/components/shared";

export function ApplicationActionConfirmation({
  confirmAction,
  setConfirmAction,
  id,
  client,
  act,
  setParams,
}: {
  confirmAction: string;
  setConfirmAction: (action: string) => void;
  id: string;
  client: ReturnType<typeof useQueryClient>;
  act: (action: string) => Promise<void>;
  setParams: ReturnType<typeof useSearchParams>[1];
}) {
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
      onConfirm={async () => {
        if (confirmAction.startsWith("rollback:")) {
          const d = await rollbackApplication(id, {
            releaseId: confirmAction.split(":")[1],
          });
          setParams({ deployment: d.id, tab: "deployments" });
        } else if (confirmAction.startsWith("delete:")) {
          await deleteActionResource(confirmAction);
          await client.invalidateQueries({ queryKey: resourceKeys.all });
        } else await act(confirmAction);
      }}
    />
  );
}
