import type { Resource } from "@/lib/api/types";

import { FlushCard } from "@/components/FlushCard";
import { ErrorState, Loading } from "@/components/Shared";
import { TableHeadings } from "@/components/TableHeadings";
import { Table, TableBody, TableHeader } from "@/components/ui/table";

import type { useDNSRecordsPage } from "../hooks";

import { DNSRecordRow } from "./DNSRecordRow";
export type DNSRecordTableProps = {
  zone: Resource;
  controller: ReturnType<typeof useDNSRecordsPage>;
};
export function DNSRecordTable({ zone, controller }: DNSRecordTableProps) {
  const { q } = controller.derived;
  const { handleRecordAction } = controller.handlers;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <FlushCard>
      <Table>
        <TableHeader>
          <TableHeadings
            columns={[
              { id: "type", label: <>Type</> },
              { id: "name", label: <>Name</> },
              { id: "content", label: <>Content</> },
              { id: "ttl", label: <>TTL</> },
              { id: "proxy", label: <>Proxy</> },
              { id: "actions", label: <></> },
            ]}
            rowProps={{}}
          />
        </TableHeader>
        <TableBody onClick={handleRecordAction}>
          {q.data?.map((record) => (
            <DNSRecordRow
              key={record.id}
              record={record}
              canWrite={zone.canWrite}
            />
          ))}
        </TableBody>
      </Table>
      {!q.data?.length && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No records in this zone.
        </div>
      )}
    </FlushCard>
  );
}
