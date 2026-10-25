import type { Metric } from "@/lib/api/types";

import { TableHeadings } from "@/components/TableHeadings";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdmin } from "@/lib/session";
export type ApplicationContainerMetricsProps = { metrics?: Metric[] };
export function ApplicationContainerMetrics({
  metrics,
}: ApplicationContainerMetricsProps) {
  const admin = useAdmin();
  if (!admin) return null;
  const containers = metrics?.at(-1)?.containers ?? [];
  return (
    <Card className="mt-5 overflow-hidden pb-0 shadow-none">
      <CardHeader>
        <CardTitle className="text-sm">Container resources</CardTitle>
        <p className="text-xs text-muted-foreground">
          Sampled every 30 seconds. CPU may exceed 100% across multiple cores.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {containers.length ? (
          <Table>
            <TableHeader>
              <TableHeadings
                columns={[
                  { id: "container", label: <>Container</> },
                  { id: "cpu", label: <>CPU</> },
                  { id: "memory", label: <>Memory</> },
                ]}
                rowProps={{}}
              />
            </TableHeader>
            <TableBody>
              {containers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-60 truncate font-mono text-xs">
                    {c.name}
                  </TableCell>
                  <TableCell>{c.cpu.toFixed(1)}%</TableCell>
                  <TableCell>{c.memory.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Container metrics appear after deployment and the next metrics poll.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
