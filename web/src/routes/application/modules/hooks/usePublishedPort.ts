import type { ChangeEvent } from "react";

import type { DraftRow } from "@/lib/draft-rows";

import { inputNumberSchema } from "@/lib/schemas/coercion";

import type { Port } from "../generics";

export function usePublishedPort(
  service: string,
  port: DraftRow<Port>,
  publicPorts: Record<string, DraftRow<Port>[]>,
  editPorts: (ports: Record<string, DraftRow<Port>[]>) => void,
) {
  function updatePort(next: Partial<Port>) {
    editPorts({
      ...publicPorts,
      [service]: publicPorts[service].map((row) =>
        row.rowId === port.rowId ? { ...row, ...next } : row,
      ),
    });
  }
  function changeField(event: ChangeEvent<HTMLInputElement>) {
    const key = event.currentTarget.dataset.portField;
    const value = event.currentTarget.value;
    if (key === "host") updatePort({ host: value });
    if (key === "published")
      updatePort({ published: inputNumberSchema.parse(value) });
    if (key === "target")
      updatePort({ target: inputNumberSchema.parse(value) });
  }
  function changeProtocol(protocol: string) {
    updatePort({ protocol });
  }
  function removePort() {
    editPorts({
      ...publicPorts,
      [service]: publicPorts[service].filter((row) => row.rowId !== port.rowId),
    });
  }
  return {
    state: {},
    derived: {},
    handlers: { changeField, changeProtocol, removePort },
  };
}
