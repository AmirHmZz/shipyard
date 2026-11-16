import { Braces } from "lucide-react";

import { SettingsSection } from "@/components/SettingsSection";
import { TableHeadings } from "@/components/TableHeadings";
import { Table, TableBody, TableHeader } from "@/components/ui/table";

import type { VariableController } from "./variables";

import { VariableRow } from "./VariableRow";
export type VariableTableProps = {
  controller: VariableController;
};
export function VariableTable({ controller }: VariableTableProps) {
  const { resource, keys, secretKeys, ordinary, busy } = controller.derived;
  const { handleVariableAction } = controller.handlers;
  return (
    <SettingsSection
      title="Configured variables"
      description="Values defined in this scope. Secrets stay hidden after saving."
      icon={<Braces />}
    >
      {!keys.length ? (
        <div className="flex min-h-60 flex-col items-center justify-center gap-2 px-5 py-10 text-center">
          <Braces className="mb-2 size-7 text-muted-foreground" />
          <p className="text-sm font-medium">No variables yet</p>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            Runtime values and build secrets will appear here when added.
          </p>
        </div>
      ) : (
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[40%]" />
            <col />
            <col className="w-20" />
          </colgroup>
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
              <VariableRow
                key={name}
                name={name}
                value={ordinary[name]}
                secret={secretKeys.has(name)}
                disabled={busy || !resource.canWrite}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </SettingsSection>
  );
}
