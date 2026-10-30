import type { DragEndEvent } from "@dnd-kit/react";

import { isSortableOperation } from "@dnd-kit/react/sortable";
import { useIsMutating } from "@tanstack/react-query";

import type { Resource } from "@/lib/api/types";

import { useMoveResource } from "@/lib/hooks/useMoveResource";

export function useResourceCardGrid(resources: Resource[]) {
  const move = useMoveResource();
  const saving = useIsMutating({ mutationKey: ["resource-card-order"] }) > 0;
  function handleDragEnd(event: DragEndEvent) {
    if (event.canceled || saving || !isSortableOperation(event.operation))
      return;
    const { source } = event.operation;
    if (!source || source.index === source.initialIndex) return;
    const resource = resources.find((row) => row.id === source.id);
    if (!resource?.canWrite || resource.data.deleting) return;
    const without = resources.filter((row) => row.id !== source.id);
    move.mutate({
      id: resource.id,
      beforeId: without[source.index]?.id ?? null,
    });
  }
  return { saving, handleDragEnd };
}
