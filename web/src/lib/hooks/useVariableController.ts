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
  return {
    resource,
    changes,
    key,
    setKey,
    value,
    setValue,
    scope,
    setScope,
    secretKeys,
    isSecret,
    setSecret,
    buildScope,
    editing,
    busy,
    ordinary,
    keys,
    remove,
    setRemove,
    reset,
    edit,
    save,
  };
}
