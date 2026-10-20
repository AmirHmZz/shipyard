import { Globe2 } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Empty } from "@/components/Shared";
import { TableHeadings } from "@/components/TableHeadings";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { DNSZoneRow } from "./DNSZoneRow";
export type DNSZoneTableProps = {
  zones: Resource[];
  visible: Resource[];
  byId: Map<string, Resource>;
};
export function DNSZoneTable({ zones, visible, byId }: DNSZoneTableProps) {
  if (!zones.length)
    return (
      <Empty
        title="Connect a DNS zone"
        description="Add a provider in Integrations, import an existing zone, and grant it to your team."
        icon={<Globe2 />}
      />
    );
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Table>
        <TableHeader>
          <TableHeadings
            columns={[
              { id: "domain", label: <>Domain</> },
              { id: "provider", label: <>Provider</> },
              { id: "connection", label: <>Connection</> },
              { id: "added", label: <>Added</> },
              {
                id: "-manage-",
                label: (
                  <>
                    <span className="sr-only">Manage</span>
                  </>
                ),
              },
            ]}
            rowProps={{}}
          />
        </TableHeader>
        <TableBody>
          {visible.length ? (
            visible.map((zone) => (
              <DNSZoneRow
                key={zone.id}
                zone={zone}
                connection={byId.get(zone.parentId || "")}
              />
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={5}
                className="h-24 text-center text-muted-foreground"
              >
                No domains match your filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
