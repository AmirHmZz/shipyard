import { Trash2 } from "lucide-react";

import type { Deployment } from "@/lib/api/types";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { describeError } from "@/lib/api/translate-error";

import { useRemoveDeployment } from "../hooks";

export type DeleteDeploymentProps = {
  deployment: Deployment;
  onClose: () => void;
};
export function DeleteDeployment({
  deployment,
  onClose,
}: DeleteDeploymentProps) {
  function handleDialogOpenChange(open: boolean) {
    if (!open && !busy) onClose();
  }
  function handleButtonClick() {
    return void remove();
  }

  const removeMutation = useRemoveDeployment(deployment.applicationId);
  const busy = removeMutation.isPending;
  const error = removeMutation.error ? describeError(removeMutation.error) : "";
  function remove() {
    if (busy) return;
    removeMutation.mutate(deployment.id, { onSuccess: onClose });
  }
  return (
    <Dialog open onOpenChange={handleDialogOpenChange}>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Delete deployment?</DialogTitle>
          <DialogDescription>
            This permanently removes deployment {deployment.id.slice(0, 8)}, its
            logs, and its retained rollback release. Unused release files and
            image tags are cleaned up. Application volumes and the active
            deployment are preserved.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={handleButtonClick}
          >
            {busy ? <Spinner className="size-4" /> : <Trash2 />}Delete
            deployment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
