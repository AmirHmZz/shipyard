import { Activity } from "lucide-react";

import type { Metric } from "@/lib/api/types";

import { SettingsSection } from "@/components/SettingsSection";
import { TableHeadings } from "@/components/TableHeadings";
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
    <div className="mt-5">
      <SettingsSection
        title="Container resources"
        description="Sampled every 30 seconds. CPU may exceed 100% across multiple cores."
        icon={<Activity />}
      >
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
          <p className="p-5 text-sm text-muted-foreground">
            Container metrics appear after deployment and the next metrics poll.
          </p>
        )}
      </SettingsSection>
    </div>
  );
}
