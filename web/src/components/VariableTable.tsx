import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { VariableController } from "./variables";
export function VariableTable({
  controller,
}: {
  controller: VariableController;
}) {
  const { resource, keys, secretKeys, ordinary, busy, edit, setRemove } =
    controller;
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Value</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
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
                  onClick={() => edit(name)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${name}`}
                  disabled={busy || !resource.canWrite}
                  onClick={() => setRemove(name)}
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
