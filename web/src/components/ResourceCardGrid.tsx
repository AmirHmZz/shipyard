import type { ReactNode } from "react";

import { DragDropProvider } from "@dnd-kit/react";

import type { Resource } from "@/lib/api/types";

import { useResourceCardGrid } from "@/lib/hooks/useResourceCardGrid";

export type ResourceCardGridProps = {
  resources: Resource[];
  children: ReactNode;
};

export function ResourceCardGrid({
  resources,
  children,
}: ResourceCardGridProps) {
  const { handleDragEnd } = useResourceCardGrid(resources);
  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </DragDropProvider>
  );
}
