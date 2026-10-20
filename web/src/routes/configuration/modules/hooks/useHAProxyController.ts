import { useMemo, useReducer } from "react";

import type { Resource } from "@/lib/api/types";
import type { DraftRow } from "@/lib/draft-rows";

import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { draftRow } from "@/lib/draft-rows";

import type { Settings, Draft } from "../generics";

import {
  haproxySettingsSchema,
  initialHAProxyDraftState,
  haproxyDraftReducer,
} from "../generics";
import { useHAProxySettings } from "./useHAProxySettings";
import { useSaveHAProxySettings } from "./useSaveHAProxySettings";

export function settingsDraft(
  settings: Pick<Settings, "version" | "bindings">,
): Draft {
  return {
    version: settings.version,
    bindings: Object.fromEntries(
      Object.entries(settings.bindings).map(([id, addresses]) => [
        id,
        addresses.map((value) => draftRow({ value })),
      ]),
    ),
  };
}

export function useHAProxyController(server: Resource) {
  const changes = useConfigurationChanges();
  const [state, dispatch] = useReducer(
    haproxyDraftReducer,
    initialHAProxyDraftState,
  );
  const { editedDraft } = state;
  const saveSettings = useSaveHAProxySettings(server.id);
  const busy = saveSettings.isPending;
  const job = state.trackingJob ? saveSettings.data?.jobId : undefined;
  const localError = saveSettings.error
    ? describeError(saveSettings.error)
    : "";
  const q = useHAProxySettings(server);
  const bindings = q.data?.bindings;
  const version = q.data?.version;
  const savedDraft = useMemo(
    () =>
      bindings && version !== undefined
        ? settingsDraft({ bindings, version })
        : null,
    [bindings, version],
  );
  const applyId = q.data?.apply?.id;
  const applyState = q.data?.apply?.state;
  const applyError = q.data?.apply?.error;
  const lastJobId = q.data?.lastJobId;
  const queryVersion = q.data?.version;
  const queryBindings = q.data?.bindings;
  const jobDone =
    !!job && applyId === job && ["done", "failed"].includes(applyState || "");
  const success = !!(
    jobDone &&
    applyState === "done" &&
    lastJobId === job &&
    queryVersion !== undefined &&
    queryBindings
  );
  const draft = success ? savedDraft : (editedDraft ?? savedDraft);
  const error =
    jobDone && !success
      ? applyError || "HAProxy settings could not be applied."
      : localError;
  const pending =
    busy ||
    (!!job && !jobDone) ||
    (!!q.data?.apply && ["queued", "running"].includes(q.data.apply.state));
  const stale =
    !!draft &&
    !!q.data &&
    (draft.version !== q.data.version ||
      Object.keys(draft.bindings).some(
        (id) => !q.data.frontends.some((frontend) => frontend.id === id),
      ));
  function update(id: string, values: DraftRow<{ value: string }>[] | null) {
    const current = success ? savedDraft : (editedDraft ?? draft);
    if (!current) return;
    const bindings = { ...current.bindings };
    if (values === null) delete bindings[id];
    else bindings[id] = values;
    dispatch({
      type: "edited",
      draft: { ...current, bindings },
      stopTracking: jobDone,
    });
  }
  function reloadSaved() {
    if (!q.data) return;
    saveSettings.reset();
    dispatch({ type: "reloaded", draft: settingsDraft(q.data) });
  }
  function save() {
    if (!draft) return;
    if (pending) return;
    saveSettings.reset();
    dispatch({ type: "save_started", draft });
    const parsed = haproxySettingsSchema.safeParse({
      version: draft.version,
      bindings: Object.fromEntries(
        Object.entries(draft.bindings).map(([id, rows]) => [
          id,
          rows.map((row) => row.value),
        ]),
      ),
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    saveSettings.mutate(parsed.data, {
      onSuccess: () => changes.saved(),
    });
  }

  return {
    q,
    draft,
    reloadSaved,
    pending,
    stale,
    success,
    error,
    update,
    save,
  };
}
