import { Activity, Cpu, HardDrive, MemoryStick } from "lucide-react";

import type { MonitoringResource } from "@/lib/schemas/monitoring";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { MonitoringStat } from "./MonitoringStat";

const statusColors: Record<string, string> = {
  online: "text-primary",
  running: "text-primary",
  offline: "text-destructive",
};

function percent(value?: number) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

export type MonitoringResourceSummaryProps = {
  resource: MonitoringResource;
  availability?: number;
};
export function MonitoringResourceSummary({
  resource,
  availability,
}: MonitoringResourceSummaryProps) {
  const latest = resource.latest;
  const server = resource.kind === "server";
  return (
    <Card className="gap-4 p-4 shadow-none sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {server ? "Server" : "Application"}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
              {resource.name}
            </h2>
            <Badge
              variant="secondary"
              className={statusColors[resource.status]}
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-current"
              />
              {resource.status.replaceAll("_", " ")}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {latest ? (
            <>
              Last sample{" "}
              <time dateTime={latest.at}>
                {new Date(latest.at).toLocaleString()}
              </time>
            </>
          ) : (
            "Waiting for first sample"
          )}
        </p>
      </div>
      <dl
        className={cn(
          "grid grid-cols-2 gap-2 sm:gap-3",
          server ? "lg:grid-cols-4" : "sm:grid-cols-3",
        )}
      >
        <MonitoringStat
          label="CPU"
          value={percent(latest?.cpuValid ? latest.cpu : undefined)}
          description="Latest usage"
          icon={Cpu}
        />
        <MonitoringStat
          label="Memory"
          value={percent(latest?.valid ? latest.memory : undefined)}
          description={
            latest?.valid && latest.memoryBytes != null
              ? `${(latest.memoryBytes / 1024 ** 2).toFixed(1)} MiB used`
              : "Latest usage"
          }
          icon={MemoryStick}
        />
        {server ? (
          <MonitoringStat
            label="Storage"
            value={percent(latest?.valid ? latest.disk : undefined)}
            description="Latest usage"
            icon={HardDrive}
          />
        ) : null}
        <MonitoringStat
          label="Availability"
          value={percent(availability)}
          description="Observed in selected range"
          icon={Activity}
        />
      </dl>
    </Card>
  );
}
