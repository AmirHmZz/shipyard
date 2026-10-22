import type { ChangeEvent, MouseEvent } from "react";

import { useState } from "react";

import type { HTTPReadinessCheck } from "@/lib/application-settings";
import type { DraftRow } from "@/lib/draft-rows";

import { draftRow, withoutRowId } from "@/lib/draft-rows";
import { inputNumberSchema } from "@/lib/schemas/coercion";

export function useReadinessFields(
  value: HTTPReadinessCheck[],
  onChange: (checks: HTTPReadinessCheck[]) => void,
  dockerfile: boolean,
) {
  const [rows, setRows] = useState(() => value.map(draftRow));
  function update(next: DraftRow<HTTPReadinessCheck>[]) {
    setRows(next);
    onChange(next.map(withoutRowId));
  }
  function updateRow(
    rowId: string | undefined,
    next: Partial<HTTPReadinessCheck>,
  ) {
    update(
      rows.map((row) => (row.rowId === rowId ? { ...row, ...next } : row)),
    );
  }
  function changeField(event: ChangeEvent<HTMLInputElement>) {
    const { readinessId, readinessField } = event.currentTarget.dataset;
    const value = event.currentTarget.value;
    if (readinessField === "service")
      updateRow(readinessId, { service: value });
    if (readinessField === "path") updateRow(readinessId, { path: value });
    if (readinessField === "port")
      updateRow(readinessId, { port: inputNumberSchema.parse(value) });
  }
  function removeRow(event: MouseEvent<HTMLButtonElement>) {
    const rowId = event.currentTarget.dataset.readinessId;
    update(rows.filter((row) => row.rowId !== rowId));
  }
  function addRow() {
    update([
      ...rows,
      draftRow({ service: dockerfile ? "app" : "", port: 0, path: "/health" }),
    ]);
  }
  return {
    state: { rows },
    derived: {},
    handlers: { changeField, removeRow, addRow },
  };
}
