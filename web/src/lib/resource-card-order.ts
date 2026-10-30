import type { Resource } from "@/lib/api/types";

export function orderedCards(resources: Resource[]) {
  return [...resources].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

export function moveCard(
  resources: Resource[],
  id: string,
  beforeId: string | null,
) {
  const moved = resources.find((row) => row.id === id);
  if (!moved || id === beforeId) return resources;
  const scope = orderedCards(
    resources.filter(
      (row) =>
        row.kind === moved.kind &&
        (row.kind === "project" ||
          (row.parentId === moved.parentId && !row.data.previewOf)),
    ),
  );
  const without = scope.filter((row) => row.id !== id);
  const index =
    beforeId === null
      ? without.length
      : without.findIndex((row) => row.id === beforeId);
  if (index < 0) return resources;
  without.splice(index, 0, moved);
  const positions = new Map(
    without.map((row, position) => [row.id, position + 1]),
  );
  return resources.map((row) =>
    positions.has(row.id) ? { ...row, sortOrder: positions.get(row.id) } : row,
  );
}
