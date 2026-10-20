import type { ChangeEvent, FormEvent, MouseEvent } from "react";

import { useReducer } from "react";
import { toast } from "sonner";

import type { Resource } from "@/lib/api/types";

import { toastValidationError } from "@/lib/api/toaster";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { variableWriteSchema } from "@/lib/schemas/variables";
import { initialVariableState, variableReducer } from "@/lib/variable-state";

import { useSaveVariable } from "./useSaveVariable";

export function useVariableController(resource: Resource) {
  const changes = useConfigurationChanges();
  const variable = useSaveVariable(resource);
  const [state, dispatch] = useReducer(variableReducer, initialVariableState);
  const { key, value, scope, secret, editing, remove } = state;
  const buildScope = scope === "build:" || scope === "preview-build:";
  const isSecret = buildScope || secret;
  const ordinary = resource.variables || {};
  const secretKeys = new Set(
    resource.secretKeys.filter((name) =>
      /^(env|build|preview-env|preview-build):/.test(name),
    ),
  );
  const keys = [...new Set([...Object.keys(ordinary), ...secretKeys])].sort();
  const busy = variable.isPending;
  function setKey(value: string) {
    dispatch({ type: "key_changed", value });
  }
  function setValue(value: string) {
    dispatch({ type: "value_changed", value });
  }
  function setScope(value: string) {
    dispatch({ type: "scope_changed", value });
  }
  function setSecret(value: boolean) {
    dispatch({ type: "secret_changed", value });
  }
  function setRemove(value: string) {
    dispatch({ type: "removal_changed", value });
  }
  function reset() {
    dispatch({ type: "reset" });
  }
  function edit(name: string) {
    const index = name.indexOf(":");
    dispatch({
      type: "editing_started",
      scope: name.slice(0, index + 1),
      key: name.slice(index + 1),
      value: secretKeys.has(name) ? "" : ordinary[name],
      secret: secretKeys.has(name),
      name,
    });
  }
  function save(name: string, value: string | null, encrypted: boolean) {
    if (busy) return;
    const parsed = variableWriteSchema.safeParse({ name, value, encrypted });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    variable.mutate(parsed.data, {
      onSuccess: () => {
        const clearEditor = value !== null || editing === name;
        dispatch({ type: "saved", clearEditor });
        if (clearEditor) changes.saved();
        toast.success(
          `Variable ${value === null ? "removed" : "saved"}. Deploy to apply it.`,
        );
      },
    });
  }
  function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save(scope + key, value, isSecret);
  }
  function changeKey(event: ChangeEvent<HTMLInputElement>) {
    setKey(event.currentTarget.value);
  }
  function changeValue(event: ChangeEvent<HTMLTextAreaElement>) {
    setValue(event.currentTarget.value);
  }
  function cancelEditor() {
    reset();
    changes.saved();
  }
  function handleVariableAction(event: MouseEvent<HTMLTableSectionElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-variable-name]",
    );
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return;
    const name = button.dataset.variableName;
    if (!name) return;
    if (button.dataset.variableAction === "edit") edit(name);
    if (button.dataset.variableAction === "remove") setRemove(name);
  }
  return {
    state: { key, value, scope, editing, remove },
    derived: {
      resource,
      changes,
      secretKeys,
      isSecret,
      buildScope,
      busy,
      ordinary,
      keys,
    },
    handlers: {
      setKey,
      setValue,
      setScope,
      setSecret,
      setRemove,
      reset,
      edit,
      save,
      submitEditor,
      changeKey,
      changeValue,
      cancelEditor,
      handleVariableAction,
    },
  };
}
