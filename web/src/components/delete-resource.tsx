import { Trash2 } from "lucide-react";
import { useState } from "react";

import type { Resource } from "@/lib/api/types";

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
import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { useDeleteResource } from "@/lib/hooks";
import { text } from "@/lib/resource-fields";
import { resourceDeletionSchema } from "@/lib/schemas/resources";

export function DeleteResource({
  resource,
  onClose,
  onDeleted,
}: {
  resource: Resource;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const deletion = useDeleteResource();
  const [name, setName] = useState("");
  const busy = deletion.isPending;
  const error = deletion.error ? describeError(deletion.error) : "";
  function remove() {
    if (busy) return;
    const parsed = resourceDeletionSchema(resource.name).safeParse({ name });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    deletion.mutate(resource.id, {
      onSuccess: () => {
        onDeleted();
        onClose();
      },
    });
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
