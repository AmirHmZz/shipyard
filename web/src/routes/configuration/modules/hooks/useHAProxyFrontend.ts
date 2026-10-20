import type { ChangeEvent, MouseEvent } from "react";

import type { DraftRow } from "@/lib/draft-rows";

import { draftRow } from "@/lib/draft-rows";

import type { Draft, Settings } from "../generics";

export function useHAProxyFrontend(
  frontend: Settings["frontends"][number],
  draft: Draft,
  update: (id: string, rows: DraftRow<{ value: string }>[] | null) => void,
) {
  const custom = draft.bindings[frontend.id];
  const defaults = custom === undefined;
  const values = custom || [];
  const id = `haproxy-${frontend.id}`;
  function toggleDefaults(useDefaults: boolean) {
    update(
      frontend.id,
      useDefaults
        ? null
        : frontend.defaultAddresses.map((value) => draftRow({ value })),
    );
  }
  function addAddress() {
    update(frontend.id, [...values, draftRow({ value: "" })]);
  }
  function changeAddress(event: ChangeEvent<HTMLInputElement>) {
    const rowId = event.currentTarget.dataset.addressRow;
    const value = event.currentTarget.value;
    update(
      frontend.id,
      values.map((row) => (row.rowId === rowId ? { ...row, value } : row)),
    );
  }
  function removeAddress(event: MouseEvent<HTMLButtonElement>) {
    const rowId = event.currentTarget.dataset.addressRow;
    update(
      frontend.id,
      values.filter((row) => row.rowId !== rowId),
    );
  }
  return {
    state: {},
    derived: { defaults, values, id },
    handlers: { toggleDefaults, addAddress, changeAddress, removeAddress },
  };
}
