import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import type { Metric } from "@/lib/api/types";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

import { metricChartData } from "../utils/chart-data";
import { MonitoringThroughputChart } from "./MonitoringThroughputChart";

const percentConfig = {
  cpu: { label: "CPU", color: "var(--primary)" },
  memory: { label: "Memory", color: "var(--chart-5)" },
  disk: { label: "Storage", color: "var(--chart-4)" },
  peakMemory: { label: "Peak memory", color: "var(--chart-5)" },
  peakDisk: { label: "Peak storage", color: "var(--chart-4)" },
  peakCpu: { label: "Peak CPU", color: "var(--primary)" },
};
const usageSeries = ["cpu", "memory", "disk"];
const peakSeries = ["peakCpu", "peakMemory", "peakDisk"];

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const dayFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const timestampFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatTimestamp(value: unknown) {
  return formatDate(timestampFormat, String(value));
}

function formatDate(format: Intl.DateTimeFormat, value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? format.format(timestamp) : "";
}

export type MonitoringChartsProps = {
  data: Metric[];
  server: boolean;
  range: string;
};
export function MonitoringCharts({
  data,
  server,
  range,
}: MonitoringChartsProps) {
  const [network, setNetwork] = useState("");
  const [disk, setDisk] = useState("");
  const latest = data.at(-1);
  const networks = latest?.network ?? [];
  const devices = latest?.devices ?? [];
  const selectedNetwork =
    networks.find((entry) => entry.name === network)?.name ??
    networks[0]?.name ??
    "";
  const selectedDisk =
    devices.find((entry) => entry.name === disk)?.name ??
    devices[0]?.name ??
    "";
  const showPeaks = range === "7d" || range === "30d";
  const seriesCount = server ? 3 : 2;
  const axisFormat = showPeaks ? dayFormat : timeFormat;
  const rows = metricChartData(data, range);
  const percentData = rows.map((point) => ({
    ...point,
    cpu: point.online && point.cpuValid !== false ? point.cpu : null,
    memory: point.online && point.valid !== false ? point.memory : null,
    disk: point.online && point.valid !== false ? point.disk : null,
  }));
  const networkData = rows.map((point) => {
    const io = point.network?.find((entry) => entry.name === selectedNetwork);
    return {
      at: point.at,
      incoming: server ? io?.read : point.networkRx,
      outgoing: server ? io?.write : point.networkTx,
    };
  });
  const diskData = rows.map((point) => {
    const io = point.devices?.find((entry) => entry.name === selectedDisk);
    return {
      at: point.at,
      incoming: server ? io?.read : point.diskRead,
      outgoing: server ? io?.write : point.diskWrite,
    };
  });

  function formatTick(value: string) {
    return formatDate(axisFormat, value);
  }

  return (
    <section
      aria-labelledby="monitoring-history"
      className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2"
    >
      <Card className="min-w-0 gap-4 py-4 shadow-none xl:col-span-2">
        <CardHeader className="px-4 sm:px-5">
          <h3 id="monitoring-history" className="font-semibold">
            Resource utilization
          </h3>
          <p className="text-sm text-muted-foreground">
            Usage over time. Gaps indicate unavailable samples.
            {showPeaks ? " Dashed lines show peak usage." : null}
          </p>
        </CardHeader>
        <CardContent className="px-3 sm:px-5">
          <ChartContainer
            config={percentConfig}
            className="h-64 w-full sm:h-72"
          >
            <LineChart data={percentData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="at"
                tickFormatter={formatTick}
                minTickGap={28}
                tickMargin={8}
                tickLine={false}
                axisLine={false}
              />
              <YAxis unit="%" width={48} tickLine={false} axisLine={false} />
              <ChartTooltip
                content={<ChartTooltipContent />}
                labelFormatter={formatTimestamp}
              />
              <ChartLegend
                content={<ChartLegendContent className="flex-wrap" />}
              />
              {usageSeries.slice(0, seriesCount).map((series) => (
                <Line
                  key={series}
                  dataKey={series}
                  stroke={`var(--color-${series})`}
                  strokeWidth={2}
                  dot={data.length === 1}
                  isAnimationActive={false}
                />
              ))}
              {showPeaks
                ? peakSeries
                    .slice(0, seriesCount)
                    .map((series) => (
                      <Line
                        key={series}
                        dataKey={series}
                        stroke={`var(--color-${series})`}
                        strokeDasharray="4 4"
                        dot={false}
                        legendType="none"
                        isAnimationActive={false}
                      />
                    ))
                : null}
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <MonitoringThroughputChart
        title="Network traffic"
        kind="network"
        data={networkData}
        options={server ? networks.map((entry) => entry.name) : []}
        selected={selectedNetwork}
        onSelect={setNetwork}
        formatTick={formatTick}
        formatTimestamp={formatTimestamp}
      />
      <MonitoringThroughputChart
        title="Disk I/O"
        kind="disk"
        data={diskData}
        options={server ? devices.map((entry) => entry.name) : []}
        selected={selectedDisk}
        onSelect={setDisk}
        formatTick={formatTick}
        formatTimestamp={formatTimestamp}
      />
    </section>
  );
}
