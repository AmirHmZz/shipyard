import { lazy, Suspense } from "react";

import type { MonitoringResource } from "@/lib/schemas/monitoring";

import { ErrorState, Loading } from "@/components/Shared";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";

import { useMonitoringMetrics } from "../hooks";
import { MonitoringIncidents } from "./MonitoringIncidents";
import { MonitoringResourcePolicy } from "./MonitoringResourcePolicy";
const MonitoringCharts = lazy(() =>
  import("./MonitoringCharts").then((module) => ({
    default: module.MonitoringCharts,
  })),
);
export type MonitoringResourceDetailProps = {
  resource: MonitoringResource;
  range: string;
};
export function MonitoringResourceDetail({
  resource,
  range,
}: MonitoringResourceDetailProps) {
  const query = useMonitoringMetrics(resource.id, resource.kind, range);
  const latest = resource.latest;
  const samples = (query.data || []).reduce(
    (sum, point) => sum + (point.samples || 1),
    0,
  );
  const online = (query.data || []).reduce(
    (sum, point) =>
      sum +
      (point.availability ?? (point.online ? 100 : 0)) * (point.samples || 1),
    0,
  );
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>
            {resource.name} · {resource.status}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6 text-sm">
          <span>
            CPU: {latest?.cpuValid ? `${latest.cpu.toFixed(1)}%` : "—"}
          </span>
          <span>
            Memory:{" "}
            {latest?.valid
              ? `${latest.memory.toFixed(1)}% (${((latest.memoryBytes || 0) / 1024 / 1024).toFixed(1)} MiB)`
              : "—"}
          </span>
          {resource.kind === "server" && (
            <span>
              Storage: {latest?.valid ? `${latest.disk.toFixed(1)}%` : "—"}
            </span>
          )}
          {samples > 0 && (
            <span>Observed availability: {(online / samples).toFixed(1)}%</span>
          )}
          <span>
            Last sample:{" "}
            {latest
              ? new Date(latest.at).toLocaleString()
              : "Waiting for collection"}
          </span>
        </CardContent>
      </Card>
      {query.isPending && <Loading />}
      {query.error && <ErrorState error={query.error} />}
      {query.data?.length ? (
        <Suspense fallback={<Loading />}>
          <MonitoringCharts
            key={resource.id}
            data={query.data}
            server={resource.kind === "server"}
            range={range}
          />
        </Suspense>
      ) : (
        <p className="text-sm text-muted-foreground">
          Metrics appear after the next 30-second collection. Gaps indicate
          unavailable measurements.
        </p>
      )}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Current containers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {latest?.containers.length ? (
              latest.containers.map((container) => (
                <div
                  key={container.id}
                  className="flex flex-wrap justify-between gap-3 border-b pb-3 text-sm"
                >
                  <span className="break-all font-mono">{container.name}</span>
                  <span>
                    CPU{" "}
                    {container.cpuValid ? `${container.cpu.toFixed(1)}%` : "—"}{" "}
                    · RAM{" "}
                    {((container.memoryBytes || 0) / 1024 / 1024).toFixed(1)}{" "}
                    MiB
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No running containers in the latest sample. Idle Jobs and
                intentionally stopped apps do not trigger availability alerts.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <MonitoringResourcePolicy resource={resource} />
      <MonitoringIncidents id={resource.id} />
    </div>
  );
}
