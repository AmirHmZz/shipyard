import { Pencil, Trash2 } from "lucide-react";

import { TableHeadings } from "@/components/TableHeadings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { VariableController } from "./variables";
export type VariableTableProps = {
  controller: VariableController;
};
export function VariableTable({ controller }: VariableTableProps) {
  const { resource, keys, secretKeys, ordinary, busy } = controller.derived;
  const { handleVariableAction } = controller.handlers;
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Table>
        <TableHeader>
          <TableHeadings
            columns={[
              { id: "name", label: <>Name</> },
              { id: "value", label: <>Value</> },
              { id: "actions", label: <></> },
            ]}
            rowProps={{}}
          />
        </TableHeader>
        <TableBody onClick={handleVariableAction}>
          {keys.map((name) => (
            <TableRow key={name}>
              <TableCell className="font-mono text-xs">{name}</TableCell>
              <TableCell className="max-w-sm whitespace-pre-wrap break-all font-mono text-xs">
                {secretKeys.has(name)
                  ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                  : ordinary[name]}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${name}`}
                  disabled={busy || !resource.canWrite}
                  data-variable-name={name}
                  data-variable-action="edit"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${name}`}
                  disabled={busy || !resource.canWrite}
                  data-variable-name={name}
                  data-variable-action="remove"
                >
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
