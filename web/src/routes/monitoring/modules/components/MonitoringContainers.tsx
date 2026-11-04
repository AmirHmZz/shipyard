import { Box } from "lucide-react";

import type { Metric } from "@/lib/api/types";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type MonitoringContainersProps = { containers?: Metric["containers"] };
export function MonitoringContainers({
  containers,
}: MonitoringContainersProps) {
  return (
    <Card className="min-w-0 gap-4 py-0 shadow-none">
      <CardHeader className="px-4 pt-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Box aria-hidden="true" className="size-4 text-primary" />
          <h3 id="monitoring-containers" className="font-semibold">
            Current containers
          </h3>
          <Badge variant="secondary">{containers?.length ?? 0}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          CPU and memory usage from the latest sample.
        </p>
      </CardHeader>
      {containers?.length ? (
        <Table aria-labelledby="monitoring-containers" className="table-fixed">
          <TableHeader>
            <TableRow className="border-t hover:bg-transparent">
              <TableHead scope="col" className="px-3 first:pl-4 sm:first:pl-5">
                Container
              </TableHead>
              <TableHead scope="col" className="w-18 px-3 text-right sm:w-28">
                CPU
              </TableHead>
              <TableHead
                scope="col"
                className="w-28 px-3 text-right last:pr-4 sm:w-40 sm:last:pr-5"
              >
                Memory
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {containers.map((container) => (
              <TableRow key={container.id}>
                <TableCell className="px-3 font-mono whitespace-normal [overflow-wrap:anywhere] first:pl-4 sm:first:pl-5">
                  {container.name}
                </TableCell>
                <TableCell className="px-3 text-right tabular-nums">
                  {container.cpuValid ? `${container.cpu.toFixed(1)}%` : "—"}
                </TableCell>
                <TableCell className="px-3 text-right tabular-nums last:pr-4 sm:last:pr-5">
                  {container.valid !== false && container.memoryBytes != null
                    ? `${(container.memoryBytes / 1024 ** 2).toFixed(1)} MiB`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="border-t px-4 py-5 text-sm text-muted-foreground sm:px-5">
          No running containers in the latest sample. Idle jobs and
          intentionally stopped apps do not trigger availability alerts.
        </p>
      )}
    </Card>
  );
}
