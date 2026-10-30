import type { ReactNode } from "react";

import { useSortable } from "@dnd-kit/react/sortable";
import { useIsMutating } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  // Keep the handle mounted: otherwise the drag library puts disabled/button
  // semantics on the card itself and disables its menus and navigation links.
  return (
    <div ref={ref} className="relative min-w-0" data-card-id={resource.id}>
      {children}
      <Button
        ref={handleRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Reorder ${resource.name}`}
        hidden={!editable}
        disabled={disabled || saving || !editable}
        className={cn(
          "absolute top-6 left-17 z-20 touch-none cursor-grab active:cursor-grabbing",
          !editable && "hidden",
        )}
      >
        <GripVertical />
      </Button>
    </div>
  );
}
