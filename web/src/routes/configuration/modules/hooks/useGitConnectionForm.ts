import { useReducer } from "react";

import type { Resource } from "@/lib/api/types";

import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { useConfigurationChanges } from "@/lib/configuration-state";

import type { InstanceDraft, Start } from "../generics";

import {
  initialGitConnectionState,
  gitConnectionReducer,
  gitSetupSchema,
} from "../generics";
import { followGitSetup } from "../utils";
import { useCreateGitWebhook } from "./useCreateGitWebhook";
import { useGiteaInstances } from "./useGiteaInstances";
import { useGitSetupConfig } from "./useGitSetupConfig";
import { useGitSetupStatus } from "./useGitSetupStatus";
import { useReconnectGit } from "./useReconnectGit";
import { useSaveGiteaInstance } from "./useSaveGiteaInstance";
import { useStartGitSetup } from "./useStartGitSetup";

export function useGitConnectionForm(existing?: Resource) {
  const changes = useConfigurationChanges();
  const [state, dispatch] = useReducer(
    gitConnectionReducer,
    existing,
    initialGitConnectionState,
  );
  const startSetup = useStartGitSetup();
  const reconnect = useReconnectGit(existing?.id ?? "");
  const saveInstance = useSaveGiteaInstance();
  const createWebhook = useCreateGitWebhook(existing?.id ?? "");
  const busy =
    startSetup.isPending ||
    reconnect.isPending ||
    saveInstance.isPending ||
    createWebhook.isPending;
  const mutationError =
    startSetup.error ||
    reconnect.error ||
    saveInstance.error ||
    createWebhook.error;
  const error = mutationError ? describeError(mutationError) : "";
  const instances = useGiteaInstances(state.provider);
  const config = useGitSetupConfig();
  const status = useGitSetupStatus(existing);
  const callback = config.data?.giteaCallback || "";
  const selected = instances.data?.find(
    (instance) => instance.id === state.instanceId,
  );
  const secret = createWebhook.data?.secret ?? "";
  function resetErrors() {
    startSetup.reset();
    reconnect.reset();
    saveInstance.reset();
    createWebhook.reset();
  }
  function setProvider(value: string) {
    dispatch({ type: "provider_changed", value });
    resetErrors();
  }
  function setName(value: string) {
    dispatch({ type: "field_changed", field: "name", value });
  }
  function setOwner(value: string) {
    dispatch({ type: "field_changed", field: "owner", value });
  }
  function setInstanceId(value: string) {
    dispatch({ type: "field_changed", field: "instanceId", value });
  }
  function setInstanceForm(value: InstanceDraft | null) {
    dispatch({ type: "instance_form_changed", value });
  }
  function completeConnection(result: Start) {
    changes.saved();
    followGitSetup(result);
  }
  function connect() {
    if (busy) return;
    resetErrors();
    if (existing) {
      reconnect.mutate(undefined, { onSuccess: completeConnection });
      return;
    }
    const parsed = gitSetupSchema.safeParse(state);
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    startSetup.mutate(parsed.data, { onSuccess: completeConnection });
  }
  return {
    state,
    derived: {
      busy,
      error,
      instances,
      config,
      status,
      callback,
      selected,
      secret,
      saveInstance,
      createWebhook,
    },
    handlers: {
      resetErrors,
      setProvider,
      setName,
      setOwner,
      setInstanceId,
      setInstanceForm,
      connect,
    },
  };
}
