import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { SelectControl } from "@/components/SelectControl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const throughputConfig = {
  network: {
    incoming: { label: "Received", color: "var(--primary)" },
    outgoing: { label: "Sent", color: "var(--chart-5)" },
  },
  disk: {
    incoming: { label: "Read", color: "var(--primary)" },
    outgoing: { label: "Write", color: "var(--chart-5)" },
  },
};
const rateFormat = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

export type MonitoringThroughputChartProps = {
  title: string;
  kind: keyof typeof throughputConfig;
  data: { at: string; incoming?: number | null; outgoing?: number | null }[];
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  formatTick: (value: string) => string;
  formatTimestamp: (value: unknown) => string;
};
export function MonitoringThroughputChart({
  title,
  kind,
  data,
  options,
  selected,
  onSelect,
  formatTick,
  formatTimestamp,
}: MonitoringThroughputChartProps) {
  const hasData = data.some(
    (point) => point.incoming != null || point.outgoing != null,
  );
  return (
    <Card className="min-w-0 gap-4 py-4 shadow-none">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">Bytes per second</p>
        </div>
        {options.length > 0 ? (
          <SelectControl
            value={selected}
            onValueChange={onSelect}
            options={options}
            triggerProps={{
              "aria-label":
                kind === "network" ? "Network interface" : "Block device",
              className: "min-w-0 max-w-full",
              size: "sm",
            }}
          />
        ) : null}
      </CardHeader>
      <CardContent className="px-3 sm:px-5">
        {hasData ? (
          <ChartContainer
            config={throughputConfig[kind]}
            className="h-52 w-full"
          >
            <LineChart data={data}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="at"
                tickFormatter={formatTick}
                minTickGap={28}
                tickMargin={8}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                width={48}
                tickFormatter={rateFormat.format}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                content={<ChartTooltipContent />}
                labelFormatter={formatTimestamp}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="incoming"
                stroke="var(--color-incoming)"
                strokeWidth={2}
                dot={data.length === 1}
                isAnimationActive={false}
              />
              <Line
                dataKey="outgoing"
                stroke="var(--color-outgoing)"
                strokeWidth={2}
                dot={data.length === 1}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <p className="grid h-52 place-items-center rounded-lg bg-muted/40 p-4 text-center text-sm text-muted-foreground">
            No readings in this time range.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
