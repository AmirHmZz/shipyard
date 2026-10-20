import { Area, AreaChart } from "recharts";

import type { Metric } from "@/lib/api";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
const CONFIG = { cpu: { label: "CPU", color: "var(--primary)" } };
export default function ServerCPUChart({ data }: { data: Metric[] }) {
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
