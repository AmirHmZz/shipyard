import { Area, AreaChart } from "recharts";

import type { Metric } from "@/lib/api/types";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
const CONFIG = { cpu: { label: "CPU", color: "var(--primary)" } };
export type ServerCPUChartProps = { data: Metric[] };
export function ServerCPUChart({ data }: ServerCPUChartProps) {
  return (
    <ChartContainer className="h-full w-full" config={CONFIG}>
      <AreaChart data={data.slice(-60)}>
        <Area
          type="monotone"
          dataKey="cpu"
          stroke="var(--primary)"
          fill="var(--primary)"
          fillOpacity={0.1}
          strokeWidth={1.5}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
      </AreaChart>
    </ChartContainer>
  );
}
