import { Trash2 } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { InputField } from "@/components/InputField";
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
import { useResourceDeletionForm } from "@/lib/hooks/useResourceDeletionForm";

export type DeleteResourceProps = {
  resource: Resource;
  onClose: () => void;
  onDeleted: () => void;
};

export function DeleteResource({
  resource,
  onClose,
  onDeleted,
}: DeleteResourceProps) {
  const { state, derived, handlers } = useResourceDeletionForm(
    resource,
    onClose,
    onDeleted,
  );
  const { name } = state;
  const { busy, error } = derived;
  const { handleOpenChange, changeName, remove } = handlers;
  return (
    <Dialog open onOpenChange={handleOpenChange}>
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
        <InputField
          label={<>Type {resource.name} to confirm</>}
          labelProps={{ htmlFor: "delete-resource-name" }}
          inputProps={{
            id: "delete-resource-name",
            autoComplete: "off",
            value: name,
            onChange: changeName,
            disabled: busy,
          }}
        />
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
            onClick={remove}
          >
            {busy ? <Spinner className="size-4 " /> : <Trash2 />}Delete{" "}
            {resource.kind}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
