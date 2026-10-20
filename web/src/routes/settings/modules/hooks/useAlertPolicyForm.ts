import type { ChangeEvent, FormEvent } from "react";

import { useState } from "react";

import { toastValidationError } from "@/lib/api/toaster";
import { inputNumberSchema } from "@/lib/schemas/coercion";

import type { AlertPolicy } from "../generics";

import { alertPolicySchema } from "../generics";
import { useAlertPolicy } from "./useAlertPolicy";
import { useSaveAlertPolicy } from "./useSaveAlertPolicy";

export function useAlertPolicyForm() {
  const query = useAlertPolicy();
  const save = useSaveAlertPolicy();
  const [draft, setDraft] = useState<AlertPolicy | null>(null);
  const busy = save.isPending;
  const value = draft || query.data;
  function changeField(event: ChangeEvent<HTMLInputElement>) {
    const key = event.currentTarget.dataset.alertField;
    if (
      !value ||
      (key !== "cpu" &&
        key !== "memory" &&
        key !== "disk" &&
        key !== "sustainedSeconds" &&
        key !== "offlineSeconds")
    )
      return;
    setDraft({
      ...value,
      [key]: inputNumberSchema.parse(event.currentTarget.value),
    });
  }
  function submitPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = alertPolicySchema.safeParse(value);
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    save.mutate(parsed.data, { onSuccess: () => setDraft(null) });
  }
  return {
    state: { value },
    derived: { query, busy },
    handlers: { submitPolicy, changeField },
  };
}
