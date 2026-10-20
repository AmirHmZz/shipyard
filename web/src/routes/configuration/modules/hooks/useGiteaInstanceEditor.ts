import type { ChangeEvent } from "react";

import { toastValidationError } from "@/lib/api/toaster";

import type { InstanceDraft } from "../generics";
import type { useSaveGiteaInstance } from "./useSaveGiteaInstance";

import { giteaInstanceSchema } from "../generics";

type GiteaEditorActions = {
  instanceForm: InstanceDraft;
  setInstanceForm: (draft: InstanceDraft | null) => void;
  busy: boolean;
  saveInstance: ReturnType<typeof useSaveGiteaInstance>;
  resetErrors: () => void;
  setInstanceId: (id: string) => void;
};
export function useGiteaInstanceEditor({
  instanceForm,
  setInstanceForm,
  busy,
  saveInstance,
  resetErrors,
  setInstanceId,
}: GiteaEditorActions) {
  function cancel() {
    setInstanceForm(null);
  }
  function changeField(event: ChangeEvent<HTMLInputElement>) {
    const key = event.currentTarget.dataset.giteaField;
    if (
      key !== "name" &&
      key !== "url" &&
      key !== "clientId" &&
      key !== "clientSecret"
    )
      return;
    setInstanceForm({ ...instanceForm, [key]: event.currentTarget.value });
  }
  function save() {
    if (busy) return;
    resetErrors();
    const parsed = giteaInstanceSchema.safeParse(instanceForm);
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    saveInstance.mutate(parsed.data, {
      onSuccess: (value) => {
        setInstanceId(value.id);
        setInstanceForm(null);
      },
    });
  }
  return { state: {}, derived: {}, handlers: { cancel, changeField, save } };
}
