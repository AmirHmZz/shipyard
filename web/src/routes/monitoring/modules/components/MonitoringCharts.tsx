import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import type { Metric } from "@/lib/api/types";

import { SelectControl } from "@/components/SelectControl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

import { metricChartData } from "../utils/chart-data";

const percentConfig = {
  cpu: { label: "CPU", color: "var(--chart-1)" },
  memory: { label: "Memory", color: "var(--chart-2)" },
  disk: { label: "Storage", color: "var(--chart-3)" },
  peakMemory: { label: "Peak memory", color: "var(--chart-2)" },
  peakDisk: { label: "Peak storage", color: "var(--chart-3)" },
  peakCpu: { label: "Peak CPU", color: "var(--chart-1)" },
};
const ioConfig = {
  read: { label: "Read / receive B/s", color: "var(--chart-1)" },
  write: { label: "Write / transmit B/s", color: "var(--chart-2)" },
};
function tick(value: unknown) {
  return new Date(String(value)).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function bytes(value: number) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} MB/s`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} kB/s`;
  return `${value.toFixed(0)} B/s`;
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
  const networks = latest?.network || [];
  const devices = latest?.devices || [];
  const selectedNetwork = network || networks[0]?.name || "";
  const selectedDisk = disk || devices[0]?.name || "";
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
      read: server ? io?.read : point.networkRx,
      write: server ? io?.write : point.networkTx,
    };
  });
  const diskData = rows.map((point) => {
    const io = point.devices?.find((entry) => entry.name === selectedDisk);
    return {
      at: point.at,
      read: server ? io?.read : point.diskRead,
      write: server ? io?.write : point.diskWrite,
    };
  });
  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
      <Card className="min-w-0 shadow-none xl:col-span-2">
        <CardHeader>
          <CardTitle>CPU, memory{server ? " and storage" : ""} (%)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={percentConfig} className="h-64 w-full">
            <LineChart data={percentData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="at" tickFormatter={tick} minTickGap={70} />
              <YAxis />
              <ChartTooltip
                content={<ChartTooltipContent />}
                labelFormatter={tick}
              />
              <Line dataKey="cpu" stroke="var(--chart-1)" dot={false} />
              <Line dataKey="memory" stroke="var(--chart-2)" dot={false} />
              {server && (
                <Line dataKey="disk" stroke="var(--chart-3)" dot={false} />
              )}
              <Line
                dataKey="peakMemory"
                stroke="var(--chart-2)"
                strokeDasharray="3 3"
                dot={false}
              />
              {server && (
                <Line
                  dataKey="peakDisk"
                  stroke="var(--chart-3)"
                  strokeDasharray="3 3"
                  dot={false}
                />
              )}
              <Line
                dataKey="peakCpu"
                stroke="var(--chart-1)"
                strokeDasharray="3 3"
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card className="min-w-0 shadow-none">
        <CardHeader>
          <CardTitle>Network traffic</CardTitle>
          {server && networks.length > 0 && (
            <SelectControl
              value={selectedNetwork}
              onValueChange={setNetwork}
              options={networks.map((entry) => ({
                value: entry.name,
                label: entry.name,
              }))}
              triggerProps={{ "aria-label": "Network interface" }}
            />
          )}
        </CardHeader>
        <CardContent>
          <ChartContainer config={ioConfig} className="h-56 w-full">
            <LineChart data={networkData}>
              <XAxis dataKey="at" tickFormatter={tick} minTickGap={70} />
              <YAxis tickFormatter={bytes} />
              <ChartTooltip
                content={<ChartTooltipContent />}
                labelFormatter={tick}
              />
              <Line dataKey="read" stroke="var(--chart-1)" dot={false} />
              <Line dataKey="write" stroke="var(--chart-2)" dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card className="min-w-0 shadow-none">
        <CardHeader>
          <CardTitle>Disk I/O</CardTitle>
          {server && devices.length > 0 && (
            <SelectControl
              value={selectedDisk}
              onValueChange={setDisk}
              options={devices.map((entry) => ({
                value: entry.name,
                label: entry.name,
              }))}
              triggerProps={{ "aria-label": "Block device" }}
            />
          )}
        </CardHeader>
        <CardContent>
          <ChartContainer config={ioConfig} className="h-56 w-full">
            <LineChart data={diskData}>
              <XAxis dataKey="at" tickFormatter={tick} minTickGap={70} />
              <YAxis tickFormatter={bytes} />
              <ChartTooltip
                content={<ChartTooltipContent />}
                labelFormatter={tick}
              />
              <Line dataKey="read" stroke="var(--chart-1)" dot={false} />
              <Line dataKey="write" stroke="var(--chart-2)" dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
