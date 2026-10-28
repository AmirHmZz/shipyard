import type { ChangeEvent } from "react";

import { useState } from "react";

import type { Resource } from "@/lib/api/types";

import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { resourceDeletionSchema } from "@/lib/schemas/resources";

import { useDeleteResource } from "./useDeleteResource";

export function useResourceDeletionForm(
  resource: Resource,
  onClose: () => void,
  onDeleted: () => void,
) {
  const deletion = useDeleteResource();
  const [confirmation, setConfirmation] = useState({
    id: resource.id,
    name: resource.name,
    value: "",
  });
  const sameTarget =
    confirmation.id === resource.id && confirmation.name === resource.name;
  if (!sameTarget) {
    setConfirmation({ id: resource.id, name: resource.name, value: "" });
  }
  const name = sameTarget ? confirmation.value : "";
  const confirmed = resourceDeletionSchema(resource.name).safeParse({
    name,
  }).success;
  const busy = deletion.isPending;
  const error = deletion.error ? describeError(deletion.error) : "";
  function handleOpenChange(open: boolean) {
    if (!open && !busy) onClose();
  }
  function changeName(event: ChangeEvent<HTMLInputElement>) {
    setConfirmation({
      id: resource.id,
      name: resource.name,
      value: event.currentTarget.value,
    });
  }
  function remove() {
    if (busy || !resource.canWrite) return;
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
  return {
    state: { name },
    derived: { busy, error, confirmed },
    handlers: { handleOpenChange, changeName, remove },
  };
}
