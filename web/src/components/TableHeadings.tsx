import type { ComponentProps, ReactNode } from "react";

import { TableHead, TableRow } from "@/components/ui/table";

export type TableHeadingsProps = {
  columns: readonly { id: string; label: ReactNode; className?: string }[];
  rowProps?: Omit<ComponentProps<typeof TableRow>, "children">;
};
export function TableHeadings({ columns, rowProps }: TableHeadingsProps) {
  return (
    <TableRow {...rowProps}>
      {columns.map((column) => (
        <TableHead key={column.id} className={column.className}>
          {column.label}
        </TableHead>
      ))}
    </TableRow>
  );
}
