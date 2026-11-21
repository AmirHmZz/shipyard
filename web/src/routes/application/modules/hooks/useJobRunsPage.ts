import type { MouseEvent } from "react";

import { useState } from "react";
import { useSearchParams } from "react-router";

import { canDeleteJobRun } from "../generics/automation";
import { useCancelJobRun } from "./useCancelJobRun";
import { useJobRun } from "./useJobRun";
import { useJobRuns } from "./useJobRuns";
import { useStartJobRun } from "./useStartJobRun";
export function useJobRunsPage(id: string) {
  const [checked, setChecked] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string[]>([]);
  const [cursor, setCursor] = useState("");
  const [params, setParams] = useSearchParams();
  const selected = params.get("run") || "";
  const runs = useJobRuns(id, cursor);
  const latest = useJobRuns(id);
  const detail = useJobRun(id, selected);
  const start = useStartJobRun(id);
  const cancel = useCancelJobRun(id);
  const active = latest.data?.activeRun;
  const retryIn = active?.retryAt
    ? Math.max(
        0,
        Math.ceil((Date.parse(active.retryAt) - latest.dataUpdatedAt) / 1000),
      )
    : 0;
  function setSelected(run: string) {
    const next = new URLSearchParams(params);
    if (run) next.set("run", run);
    else next.delete("run");
    setParams(next, { replace: true, preventScrollReset: true });
  }
  function runNow() {
    start.mutate(crypto.randomUUID(), {
      onSuccess: function selectRun(run) {
        setCursor("");
        setSelected(run.id);
      },
    });
  }
  function selectRun(event: MouseEvent<HTMLButtonElement>) {
    setSelected(event.currentTarget.dataset.run || "");
  }
  function cancelRun(event: MouseEvent<HTMLButtonElement>) {
    const run = event.currentTarget.dataset.run;
    if (run) cancel.mutate(run);
  }
  function toggleRun(event: MouseEvent<HTMLButtonElement>) {
    const id = event.currentTarget.dataset.run;
    if (id)
      setChecked((previous) =>
        previous.includes(id)
          ? previous.filter((run) => run !== id)
          : [...previous, id],
      );
  }
  const eligible = (runs.data?.items || [])
    .filter(canDeleteJobRun)
    .map((run) => run.id);
  const checkedVisible = checked.filter((id) => eligible.includes(id));
  function toggleAll() {
    setChecked(checkedVisible.length === eligible.length ? [] : eligible);
  }
  function deleteRun(event: MouseEvent<HTMLButtonElement>) {
    const id = event.currentTarget.dataset.run;
    if (id) setDeleting([id]);
  }
  function deleteSelected() {
    setDeleting(checkedVisible);
  }
  function closeDelete() {
    setDeleting([]);
  }
  function deleted() {
    setDeleting([]);
    setChecked([]);
    setSelected("");
    setCursor("");
  }
  function nextPage() {
    setCursor(runs.data?.nextCursor || "");
  }
  function firstPage() {
    setCursor("");
  }
  return {
    checkedVisible,
    eligible,
    toggleRun,
    toggleAll,
    deleteRun,
    deleteSelected,
    deleting,
    closeDelete,
    deleted,
    runs,
    detail,
    selected,
    active,
    retryIn,
    start,
    cancel,
    cursor,
    runNow,
    selectRun,
    cancelRun,
    nextPage,
    firstPage,
  };
}
