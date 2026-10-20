import { useEffect, useMemo, useState } from "react";

import { errorMessage, type Resource } from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { draftRow, type DraftRow } from "@/lib/draft-rows";
import { haproxySettingsSchema } from "@/lib/validation";

import type { Settings, Draft } from "../generics";

import { saveHAProxySettings } from "../services";
import { useHAProxySettings } from "./useHAProxySettings";

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
  const [editedDraft, setDraft] = useState<Draft | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
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
  const draft = editedDraft ?? savedDraft;
  const applyId = q.data?.apply?.id;
  const applyState = q.data?.apply?.state;
  const applyError = q.data?.apply?.error;
  const lastJobId = q.data?.lastJobId;
  const queryVersion = q.data?.version;
  const queryBindings = q.data?.bindings;
  useEffect(() => {
    if (
      !job ||
      applyId !== job ||
      !["done", "failed"].includes(applyState || "")
    )
      return;
    setJob(null);
    if (
      applyState === "done" &&
      lastJobId === job &&
      queryVersion !== undefined &&
      queryBindings
    ) {
      setDraft({
        version: queryVersion,
        bindings: settingsDraft({
          version: queryVersion,
          bindings: queryBindings,
        }).bindings,
      });
      setSuccess(true);
    } else setError(applyError || "HAProxy settings could not be applied.");
  }, [
    job,
    applyId,
    applyState,
    applyError,
    lastJobId,
    queryVersion,
    queryBindings,
  ]);
  const pending =
    busy ||
    !!job ||
    (!!q.data?.apply && ["queued", "running"].includes(q.data.apply.state));
  const stale =
    !!draft &&
    !!q.data &&
    (draft.version !== q.data.version ||
      Object.keys(draft.bindings).some(
        (id) => !q.data.frontends.some((frontend) => frontend.id === id),
      ));
  const update = (id: string, values: DraftRow<{ value: string }>[] | null) => {
    setDraft((current) => {
      current ??= draft;
      if (!current) return current;
      const bindings = { ...current.bindings };
      if (values === null) delete bindings[id];
      else bindings[id] = values;
      return { ...current, bindings };
    });
    setSuccess(false);
  };
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      const result = await saveHAProxySettings(
        server.id,
        haproxySettingsSchema.parse({
          version: draft.version,
          bindings: Object.fromEntries(
            Object.entries(draft.bindings).map(([id, rows]) => [
              id,
              rows.map((row) => row.value),
            ]),
          ),
        }),
      );
      setJob(result.jobId);
      changes.saved();
      await q.refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return {
    q,
    draft,
    setDraft,
    pending,
    stale,
    success,
    error,
    setError,
    update,
    save,
  };
}
