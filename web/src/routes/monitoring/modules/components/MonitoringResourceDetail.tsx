import { lazy, Suspense } from "react";

import type { MonitoringResource } from "@/lib/schemas/monitoring";

import { ErrorState, Loading } from "@/components/Shared";

import { useMonitoringMetrics } from "../hooks";
import { MonitoringContainers } from "./MonitoringContainers";
import { MonitoringIncidents } from "./MonitoringIncidents";
import { MonitoringResourcePolicy } from "./MonitoringResourcePolicy";
import { MonitoringResourceSummary } from "./MonitoringResourceSummary";

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
  const server = resource.kind === "server";
  let samples = 0;
  let online = 0;
  for (const point of query.data ?? []) {
    const count = point.samples || 1;
    samples += count;
    online += (point.availability ?? (point.online ? 100 : 0)) * count;
  }

  let history = (
    <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      No samples in this time range. Metrics are collected every 30 seconds.
    </p>
  );
  if (query.isPending) {
    history = <Loading />;
  } else if (query.data?.length) {
    history = (
      <Suspense fallback={<Loading />}>
        <MonitoringCharts data={query.data} server={server} range={range} />
      </Suspense>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <MonitoringResourceSummary
        resource={resource}
        availability={samples > 0 ? online / samples : undefined}
      />
      {query.error ? <ErrorState error={query.error} /> : null}
      {query.error && !query.data?.length ? null : history}
      <MonitoringContainers containers={latest?.containers} />
      <MonitoringResourcePolicy resource={resource} />
      <MonitoringIncidents id={resource.id} />
    </div>
  );
}
