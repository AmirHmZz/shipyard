import type { ReactNode } from "react";

import { useSortable } from "@dnd-kit/react/sortable";
import { useIsMutating } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Button } from "@/components/ui/button";

export type SortableResourceCardProps = {
  resource: Resource;
  index: number;
  disabled?: boolean;
  children: ReactNode;
};

export function SortableResourceCard({
  resource,
  index,
  disabled = false,
  children,
}: SortableResourceCardProps) {
  const saving = useIsMutating({ mutationKey: ["resource-card-order"] }) > 0;
  const editable =
    resource.canWrite && !resource.data.deleting && !resource.data.previewOf;
  const { ref, handleRef } = useSortable({
    id: resource.id,
    index,
    disabled: {
      draggable: disabled || saving || !editable,
      droppable: disabled || saving || !!resource.data.deleting,
    },
  });
  return (
    <div ref={ref} className="relative min-w-0" data-card-id={resource.id}>
      {children}
      {editable && (
        <Button
          ref={handleRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Reorder ${resource.name}`}
          disabled={disabled || saving}
          className="absolute top-6 left-17 z-20 touch-none cursor-grab active:cursor-grabbing"
        >
          <GripVertical />
        </Button>
      )}
    </div>
  );
}
