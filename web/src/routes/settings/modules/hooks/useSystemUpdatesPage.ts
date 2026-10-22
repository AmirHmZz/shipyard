import { useMutationState } from "@tanstack/react-query";
import { useReducer } from "react";

import { describeError } from "@/lib/api/translate-error";

import {
  initialUpdateState,
  updateReducer,
  settingsKeys,
  versionChangePlanResponseSchema,
} from "../generics";
import { useApplyUpdate } from "./useApplyUpdate";
import { useCheckForUpdates } from "./useCheckForUpdates";
import { useDownloadUpdateBackup } from "./useDownloadUpdateBackup";
import { usePlanUpdate } from "./usePlanUpdate";
import { useSystemUpdates } from "./useSystemUpdates";

const terminal = ["succeeded", "rolled_back", "failed", "recovery_required"];

export function useSystemUpdatesPage() {
  const q = useSystemUpdates();
  const [state, dispatch] = useReducer(updateReducer, initialUpdateState);
  const check = useCheckForUpdates();
  const planChange = usePlanUpdate();
  const apply = useApplyUpdate();
  const backup = useDownloadUpdateBackup();
  const plans = useMutationState({
    filters: { mutationKey: settingsKeys.updatePlan, status: "success" },
    select: (mutation) => {
      const parsed = versionChangePlanResponseSchema.safeParse(
        mutation.state.data,
      );
      return parsed.success ? parsed.data : undefined;
    },
  });
  const plan = state.reviewOpen ? (plans.at(-1) ?? null) : null;
  const operations = [check, planChange, apply, backup];
  const busy = operations.some((mutation) => mutation.isPending);
  const failure = operations.find((mutation) => mutation.error)?.error;
  const error = failure ? describeError(failure) : "";
  const operation = q.data?.operation;
  const active = !!operation && !terminal.includes(operation.state);
  const blocked = active || operation?.state === "recovery_required";
  const current = q.data?.installation?.release;
  const available =
    q.data?.releases.filter(
      (release) =>
        release.previous === current?.version ||
        current?.previous === release.version,
    ) ?? [];
  function resetErrors() {
    for (const mutation of operations) mutation.reset();
  }
  function setTarget(value: string) {
    dispatch({ type: "target_changed", value });
  }
  function setPass(value: string) {
    dispatch({ type: "passphrase_changed", value });
  }
  function setConfirm(value: string) {
    dispatch({ type: "confirmation_changed", value });
  }
  function setApprove(value: boolean) {
    dispatch({ type: "approval_changed", value });
  }
  function applied() {
    dispatch({ type: "applied" });
  }
  function checkUpdates() {
    if (busy || blocked) return;
    resetErrors();
    check.mutate();
  }
  function download() {
    if (!operation || busy) return;
    resetErrors();
    backup.mutate(operation.id, {
      onSuccess: (blob) => {
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = `shipyard-${operation.id}.sybackup`;
        link.click();
        URL.revokeObjectURL(url);
      },
    });
  }
  function previewVersion() {
    if (busy || blocked || !state.target) return;
    resetErrors();
    planChange.mutate(
      { target: state.target },
      { onSuccess: () => dispatch({ type: "preview_succeeded" }) },
    );
  }
  return {
    state,
    derived: {
      q,
      plan,
      busy,
      error,
      operation,
      active,
      blocked,
      available,
      apply,
    },
    handlers: {
      setTarget,
      setPass,
      setConfirm,
      setApprove,
      applied,
      resetErrors,
      checkUpdates,
      download,
      previewVersion,
    },
  };
}
