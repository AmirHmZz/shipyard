import type { MouseEvent } from "react";

import { useState } from "react";

import { useCancelJobRun } from "./useCancelJobRun";
import { useJobRun } from "./useJobRun";
import { useJobRuns } from "./useJobRuns";
import { useStartJobRun } from "./useStartJobRun";
export function useJobRunsPage(id: string) {
  const [cursor, setCursor] = useState("");
  const [selected, setSelected] = useState("");
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
  function nextPage() {
    setCursor(runs.data?.nextCursor || "");
  }
  function firstPage() {
    setCursor("");
  }
  return {
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
