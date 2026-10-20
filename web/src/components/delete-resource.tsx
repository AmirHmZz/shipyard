import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Resource } from "@/lib/api";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage, text } from "@/lib/api";
import { resourceKeys } from "@/lib/query-keys";
import { resourceDeletionSchema } from "@/lib/schemas/resources";
import { deleteResource } from "@/lib/services";

export function DeleteResource({
  resource,
  onClose,
  onDeleted,
}: {
  resource: Resource;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      resourceDeletionSchema(resource.name).parse({ name });
      await deleteResource(resource.id);
      await client.invalidateQueries({ queryKey: resourceKeys.all });
      toast.success(
        "Deletion queued. Cleanup will continue in the background.",
      );
      onDeleted();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Delete {resource.kind}?</DialogTitle>
          <DialogDescription>
            {resource.kind === "project"
              ? "This removes the project, all its environments and applications, and their deployment history."
              : "This removes the application, its previews and deployment history."}{" "}
            Running containers, routes and Shipyard-owned DNS records will be
            removed. Persistent volumes and bind-mounted data are preserved.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-resource-name">
            Type {resource.name} to confirm
          </Label>
          <Input
            id="delete-resource-name"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
        </div>
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
            disabled={busy || !resource.canWrite || name !== resource.name}
            onClick={() => void remove()}
          >
            {busy ? <Spinner className="size-4 " /> : <Trash2 />}Delete{" "}
            {resource.kind}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeletionStatus({
  resource,
  onRetry,
}: {
  resource: Resource;
  onRetry: () => void;
}) {
  if (!resource.data.deleting) return null;
  return (
    <Alert
      className="mb-5"
      variant={resource.data.deletionError ? "destructive" : "default"}
    >
      <AlertDescription className="space-y-2">
        <p>
          {resource.data.deletionError
            ? `Cleanup needs attention: ${text(resource.data, "deletionError")}`
            : "Deletion in progress. Containers and routes are being cleaned up. Persistent volumes are preserved."}
        </p>
        {resource.canWrite && resource.data.deletionRoot === resource.id && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {resource.data.deletionError
              ? "Retry deletion"
              : "Deletion details"}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
