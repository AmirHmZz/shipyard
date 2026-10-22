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
  const [name, setName] = useState("");
  const busy = deletion.isPending;
  const error = deletion.error ? describeError(deletion.error) : "";
  function handleOpenChange(open: boolean) {
    if (!open && !busy) onClose();
  }
  function changeName(event: ChangeEvent<HTMLInputElement>) {
    setName(event.currentTarget.value);
  }
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
  return {
    state: { name },
    derived: { busy, error },
    handlers: { handleOpenChange, changeName, remove },
  };
}
