/** UI identity belongs to the draft, never to the API payload or editable value. */
export type DraftRow<T> = T & { rowId: string };

export function draftRow<T extends object>(value: T): DraftRow<T> {
  return { ...value, rowId: crypto.randomUUID() };
}

export function withoutRowId<T extends object>(row: DraftRow<T>): T {
  const { rowId: _rowId, ...value } = row;
  return value as T;
}
