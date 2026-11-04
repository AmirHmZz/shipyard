import { useSortable } from "@dnd-kit/react/sortable";
import { useIsMutating } from "@tanstack/react-query";

import type { Resource } from "@/lib/api/types";

export function useSortableResourceCard(
  resource: Resource,
  index: number,
  disabled: boolean,
) {
  const saving = useIsMutating({ mutationKey: ["resource-card-order"] }) > 0;
  const editable =
    resource.canWrite && !resource.data.deleting && !resource.data.previewOf;
  const dragDisabled = disabled || saving || !editable;
  const { ref, handleRef } = useSortable({
    id: resource.id,
    index,
    disabled: {
      draggable: dragDisabled,
      droppable: disabled || saving || !!resource.data.deleting,
    },
  });

  return {
    ref,
    handle: { ref: handleRef, disabled: dragDisabled, hidden: !editable },
  };
}
