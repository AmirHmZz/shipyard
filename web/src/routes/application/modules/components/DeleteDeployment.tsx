import { useRemoveDeployment } from "../hooks";
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
import { errorMessage, type Deployment } from "@/lib/api";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function DeleteDeployment({
  deployment,
  onClose,
}: {
  deployment: Deployment;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const removeMutation = useRemoveDeployment(deployment.applicationId);
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await removeMutation.mutateAsync(deployment.id);
      toast.success("Deployment cleanup queued");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
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
            onClick={() => void remove()}
          >
            {busy ? <Spinner className="size-4" /> : <Trash2 />}Delete
            deployment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
