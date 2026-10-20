import type { DeploymentTableOptions } from "@/lib/hooks/useDeploymentTable";

import { TableHeadings } from "@/components/TableHeadings";
import { Table, TableBody, TableHeader } from "@/components/ui/table";
import { useDeploymentTable } from "@/lib/hooks/useDeploymentTable";

import { DeploymentTableRow } from "./DeploymentTableRow";
export type DeploymentTableProps = DeploymentTableOptions;
export function DeploymentTable(props: DeploymentTableProps) {
  const { derived, handlers } = useDeploymentTable(props);
  const { rows } = derived;
  const { handleAction } = handlers;
  return (
    <Table>
      <TableHeader>
        <TableHeadings
          columns={[
            { id: "application", label: <>Application</> },
            { id: "status", label: <>Status</> },
            { id: "source-revision", label: <>Source revision</> },
            { id: "started", label: <>Started</> },
            { id: "details", label: <>Details</>, className: "text-right" },
          ]}
          rowProps={{}}
        />
      </TableHeader>
      <TableBody onClick={handleAction}>
        {rows.map((row) => (
          <DeploymentTableRow key={row.deployment.id} {...row} />
        ))}
      </TableBody>
    </Table>
  );
}
